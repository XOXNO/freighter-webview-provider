const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');
const {
  FreighterWebViewProvider,
  WebViewProviderError,
} = require('../dist/index.js');

afterEach(() => {
  delete global.window;
});

const install = (request) => {
  const listeners = new Map();
  const bridge = {
    provider: 'freighter',
    platform: 'mobile',
    version: '1.0.0',
    protocolVersion: 1,
    documentToken: 'document-1',
    request: async (input) =>
      input.method === 'freighter_getCapabilities'
        ? { protocolVersion: 1 }
        : request(input),
    on: (event, listener) => {
      const current = listeners.get(event) ?? new Set();
      current.add(listener);
      listeners.set(event, current);
    },
    off: (event, listener) => listeners.get(event)?.delete(listener),
  };
  global.window = { stellar: bridge };
  return { bridge, listeners };
};

test('SSR import and discovery are safe; requests require init', async () => {
  const provider = new FreighterWebViewProvider();
  assert.equal(await provider.init(), false);
  await assert.rejects(provider.connect(), { code: 'UNAVAILABLE' });
});

test('all methods preserve transport payloads and results', async () => {
  const calls = [];
  const account = {
    address: 'GACCOUNT',
    chainId: 'stellar:testnet',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };
  const cases = [
    ['connect', undefined, 'freighter_connect', account],
    ['getAccount', undefined, 'freighter_getAccount', account],
    [
      'signXDR',
      { xdr: 'xdr', chainId: account.chainId },
      'stellar_signXDR',
      { signedXDR: 'signed' },
    ],
    [
      'signAndSubmitXDR',
      { xdr: 'xdr', chainId: account.chainId },
      'stellar_signAndSubmitXDR',
      { status: 'success' },
    ],
    [
      'signMessage',
      { message: 'message', chainId: account.chainId },
      'stellar_signMessage',
      { signature: 'signature' },
    ],
    [
      'signAuthEntry',
      { entryXdr: 'entry', chainId: account.chainId },
      'stellar_signAuthEntry',
      { signedAuthEntry: 'signed', signerAddress: 'GACCOUNT' },
    ],
    ['disconnect', undefined, 'freighter_disconnect', undefined],
  ];
  install((input) => {
    calls.push(input);
    return cases.find((item) => item[2] === input.method)[3];
  });
  const provider = new FreighterWebViewProvider();
  assert.equal(await provider.init(), true);
  for (const [method, params, nativeMethod, result] of cases) {
    assert.deepEqual(await provider[method](params), result);
    assert.deepEqual(calls.at(-1), { method: nativeMethod, params });
  }
});

test('concurrent operations keep their own results and errors are not retried', async () => {
  const pending = [];
  install(
    () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  );
  const provider = new FreighterWebViewProvider();
  await provider.init();
  const first = provider.signMessage({
    message: 'first',
    chainId: 'stellar:testnet',
  });
  const second = provider.signMessage({
    message: 'second',
    chainId: 'stellar:testnet',
  });
  const error = { code: 'USER_REJECTED', message: 'Rejected' };
  pending[1].reject(error);
  // Bridge rejections are plain objects; the SDK normalizes them into typed Errors that keep the original as cause.
  await assert.rejects(
    second,
    (value) =>
      value instanceof WebViewProviderError &&
      value.code === 'USER_REJECTED' &&
      value.message === 'Rejected' &&
      value.cause === error,
  );
  pending[0].resolve({ signature: 'first-signature' });
  assert.deepEqual(await first, { signature: 'first-signature' });
  assert.equal(pending.length, 2);
});

test('event subscriptions survive discovery, deduplicate and unsubscribe', async () => {
  const { listeners } = install(() => undefined);
  const provider = new FreighterWebViewProvider();
  const seen = [];
  const listener = (value) => seen.push(value);
  provider.on('accountsChanged', listener);
  await provider.init();
  provider.on('accountsChanged', listener);
  assert.equal(listeners.get('accountsChanged').size, 1);
  listeners
    .get('accountsChanged')
    .forEach((callback) => callback({ address: 'GNEW' }));
  assert.deepEqual(seen, [{ address: 'GNEW' }]);
  provider.off('accountsChanged', listener);
  assert.equal(listeners.get('accountsChanged').size, 0);
});

test('replaced document bridge rejects requests until rediscovery', async () => {
  const old = install(() => undefined);
  const provider = new FreighterWebViewProvider();
  const listener = () => {};
  provider.on('disconnect', listener);
  await provider.init();
  const next = install(() => undefined);
  await assert.rejects(provider.connect(), { code: 'UNAVAILABLE' });
  assert.equal(await provider.init(), true);
  assert.equal(old.listeners.get('disconnect').size, 0);
  assert.equal(next.listeners.get('disconnect').size, 1);
});

test('capability negotiation fails closed and concurrent init is shared', async () => {
  const { bridge } = install(() => undefined);
  let calls = 0;
  bridge.request = async () => {
    calls += 1;
    return { protocolVersion: 2 };
  };
  const provider = new FreighterWebViewProvider();
  assert.deepEqual(await Promise.all([provider.init(), provider.init()]), [
    false,
    false,
  ]);
  assert.equal(calls, 1);
});

test('discovery recovers delayed injection', async () => {
  global.window = {};
  const provider = new FreighterWebViewProvider();
  const pending = provider.init();
  setTimeout(() => install(() => undefined), 30);
  assert.equal(await pending, true);
});

test('capability request cannot hang discovery beyond two seconds', async () => {
  const { bridge } = install(() => undefined);
  bridge.request = () => new Promise(() => {});
  const provider = new FreighterWebViewProvider();
  const start = Date.now();
  assert.equal(await provider.init(), false);
  assert.ok(Date.now() - start < 3000);
});

test('getInstance shares one provider', async () => {
  delete global.window;
  const first = FreighterWebViewProvider.getInstance();
  assert.equal(FreighterWebViewProvider.getInstance(), first);
  assert.equal(await first.init(), false);
});

test('connect passes a wallet-provided SEP-10 auth through untouched', async () => {
  const auth = {
    challengeXdr: 'c',
    signedXdr: 's',
    networkPassphrase: 'p',
    homeDomain: 'xoxno.com',
    webAuthEndpoint: 'https://api.xoxno.com/user/stellar/challenge',
  };
  install((input) =>
    input.method === 'freighter_connect'
      ? {
          address: 'GA',
          chainId: 'stellar:pubnet',
          networkPassphrase: 'p',
          auth,
        }
      : undefined,
  );
  const provider = new FreighterWebViewProvider();
  await provider.init();
  const result = await provider.connect();
  assert.deepEqual(result.auth, auth);
});
