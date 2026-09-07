const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');
const {
  ERROR_CODE,
  EVENT,
  FreighterWebViewProvider,
  METHOD,
  WebViewProviderError,
  isFreighterWebView,
} = require('../dist/index.js');

afterEach(() => {
  delete globalThis.stellar;
});

const install = (request) => {
  const listeners = new Map();
  const bridge = {
    provider: 'freighter',
    platform: 'mobile',
    version: '1.0.0',
    protocolVersion: 1,
    documentToken: 'document-1',
    request: async (input) => request(input),
    on: (event, listener) => {
      const current = listeners.get(event) ?? new Set();
      current.add(listener);
      listeners.set(event, current);
    },
    off: (event, listener) => listeners.get(event)?.delete(listener),
  };
  globalThis.stellar = bridge;
  return { bridge, listeners };
};

test('SSR import and discovery are safe; requests require init', async () => {
  const provider = new FreighterWebViewProvider();
  assert.equal(isFreighterWebView(), false);
  assert.equal(await provider.init(), false);
  await assert.rejects(provider.connect(), { code: ERROR_CODE.UNAVAILABLE });
  // Production Freighter ships the beacon without a bridge; it is not a WebView the SDK can use.
  globalThis.stellar = {
    provider: 'freighter',
    platform: 'mobile',
    version: '1',
  };
  assert.equal(isFreighterWebView(), false);
  assert.equal(await provider.init(), false);
});

test('all methods preserve transport payloads and results', async () => {
  const calls = [];
  const account = {
    address: 'GACCOUNT',
    chainId: 'stellar:testnet',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };
  const cases = [
    ['connect', undefined, METHOD.CONNECT, account],
    ['getAccount', undefined, METHOD.GET_ACCOUNT, account],
    [
      'signXDR',
      { xdr: 'xdr', chainId: account.chainId },
      METHOD.SIGN_XDR,
      { signedXDR: 'signed' },
    ],
    [
      'signAndSubmitXDR',
      { xdr: 'xdr', chainId: account.chainId },
      METHOD.SIGN_AND_SUBMIT_XDR,
      { status: 'success' },
    ],
    [
      'signMessage',
      { message: 'message', chainId: account.chainId },
      METHOD.SIGN_MESSAGE,
      { signature: 'signature' },
    ],
    [
      'signAuthEntry',
      { entryXdr: 'entry', chainId: account.chainId },
      METHOD.SIGN_AUTH_ENTRY,
      { signedAuthEntry: 'signed', signerAddress: 'GACCOUNT' },
    ],
    ['disconnect', undefined, METHOD.DISCONNECT, undefined],
  ];
  install((input) => {
    calls.push(input);
    return cases.find((item) => item[2] === input.method)[3];
  });
  const provider = new FreighterWebViewProvider();
  assert.equal(isFreighterWebView(), true);
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
  const error = { code: ERROR_CODE.USER_REJECTED, message: 'Rejected' };
  pending[1].reject(error);
  // Bridge rejections are plain objects; the SDK normalizes them into typed Errors that keep the original as cause.
  await assert.rejects(
    second,
    (value) =>
      value instanceof WebViewProviderError &&
      value.code === ERROR_CODE.USER_REJECTED &&
      value.message === 'Rejected' &&
      value.cause === error,
  );
  pending[0].resolve({ signature: 'first-signature' });
  assert.deepEqual(await first, { signature: 'first-signature' });
  assert.equal(pending.length, 2);
});

test('unknown rejections normalize to UNAVAILABLE and keep their cause', async () => {
  const causes = [new Error('boom'), { code: 'NEW_CODE' }, 'string', null];
  install((input) => Promise.reject(causes[Number(input.params.message)]));
  const provider = new FreighterWebViewProvider();
  await provider.init();
  for (const [index, cause] of causes.entries()) {
    await assert.rejects(
      provider.signMessage({
        message: String(index),
        chainId: 'stellar:testnet',
      }),
      (value) =>
        value instanceof WebViewProviderError &&
        value.code === ERROR_CODE.UNAVAILABLE &&
        value.cause === cause,
    );
  }
});

test('event subscriptions survive discovery, deduplicate and unsubscribe', async () => {
  const { listeners } = install(() => undefined);
  const provider = new FreighterWebViewProvider();
  const seen = [];
  const listener = (value) => seen.push(value);
  provider.on(EVENT.ACCOUNTS_CHANGED, listener);
  await provider.init();
  provider.on(EVENT.ACCOUNTS_CHANGED, listener);
  assert.equal(listeners.get(EVENT.ACCOUNTS_CHANGED).size, 1);
  listeners
    .get(EVENT.ACCOUNTS_CHANGED)
    .forEach((callback) => callback({ address: 'GNEW' }));
  assert.deepEqual(seen, [{ address: 'GNEW' }]);
  provider.off(EVENT.ACCOUNTS_CHANGED, listener);
  assert.equal(listeners.get(EVENT.ACCOUNTS_CHANGED).size, 0);
});

test('an unactivated or foreign bridge is unavailable, even with a matching shape', async () => {
  const { bridge } = install(() => undefined);
  bridge.protocolVersion = 2;
  const provider = new FreighterWebViewProvider();
  assert.equal(await provider.init(), false);
  bridge.protocolVersion = 1;
  bridge.documentToken = '';
  assert.equal(await provider.init(), false);
  await assert.rejects(provider.connect(), { code: ERROR_CODE.UNAVAILABLE });
  globalThis.stellar = { ...bridge, provider: 'other' };
  assert.equal(await provider.init(), false);
});

test('discovery waits for late activation and gives up after two seconds', async () => {
  const { bridge } = install(() => undefined);
  bridge.documentToken = '';
  const provider = new FreighterWebViewProvider();
  const pending = provider.init();
  setTimeout(() => {
    bridge.documentToken = 'document-2';
  }, 30);
  assert.equal(await pending, true);
  bridge.documentToken = '';
  const start = Date.now();
  assert.equal(await provider.init(), false);
  assert.ok(Date.now() - start < 3000);
});

test('getInstance shares one provider', async () => {
  delete globalThis.stellar;
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
    input.method === METHOD.CONNECT
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
