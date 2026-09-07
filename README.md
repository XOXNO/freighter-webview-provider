# Freighter WebView provider

Dependency-free TypeScript SDK for dApps opened inside Freighter mobile. Imports
are SSR-safe. Existing Freighter extension integrations need to adopt this SDK;
outside a supported WebView, keep offering your existing WalletConnect flow.

```ts
import { FreighterWebViewProvider } from '@xoxno/freighter-webview-provider';

const wallet = new FreighterWebViewProvider();
if (await wallet.init()) {
  const account = await wallet.connect();
  const { signature } = await wallet.signMessage({
    message: "Your application's authentication challenge",
    chainId: account.chainId,
  });
}
```

`init()` resolves true once the wallet has activated the document (within two
seconds), false anywhere else. Call it before other methods. `connect()` returns the selected account
without pairing or a connection approval; risky sites and failed scans still
require warning acknowledgment. Every signing request requires native approval.
Connecting a wallet does not authenticate a website session by itself. When the
wallet allows silent sign-in for a site, `connect()` also returns `auth`: a
SEP-10 challenge the wallet fetched from the site's `/.well-known/stellar.toml`
`WEB_AUTH_ENDPOINT`, verified against the TOML `SIGNING_KEY`, and
countersigned. Verify it locally exactly as you would a challenge you fetched
yourself, then submit it to your session endpoint. When `auth` is absent, run
your usual challenge flow; the wallet may still prompt for that signature.

| Method                                 | Result                                           |
| -------------------------------------- | ------------------------------------------------ |
| `connect()`                            | `{ address, chainId, networkPassphrase, auth? }` |
| `getAccount()`                         | `{ address, chainId, networkPassphrase }`        |
| `signXDR({ xdr, chainId })`            | `{ signedXDR }`                                  |
| `signAndSubmitXDR({ xdr, chainId })`   | `{ status: "success" }`                          |
| `signMessage({ message, chainId })`    | `{ signature }`                                  |
| `signAuthEntry({ entryXdr, chainId })` | `{ signedAuthEntry, signerAddress }`             |
| `disconnect()`                         | `void`                                           |

Supported chain IDs: `stellar:pubnet`, `stellar:testnet`. `getAccount()`
requires a connected document and always asks the wallet: the SDK never caches
the account, so a signer that changed in the wallet cannot be trusted by
accident. Disconnect clears the document connection, not the wallet.

`FreighterWebViewProvider.getInstance()` returns one shared provider per page.
To decide which login tiles to render before `init()` resolves, read the beacon
synchronously: `window.stellar?.provider === 'freighter' &&
window.stellar?.platform === 'mobile'`. Production Freighter ships the beacon
without the bridge, so keep a fallback flow behind it.

Subscribe with `on(event, listener)` and remove the same callback with `off`
when your component unmounts. `accountsChanged` and `chainChanged` carry the
full account context; `disconnect` carries `{ code, message }`. Subscribe before
or after init.

Every failure is thrown as a `WebViewProviderError` (an `Error` subclass with
the original bridge rejection as `cause`) whose `code` is one of `UNAVAILABLE`, `INVALID_PARAMS`,
`UNSUPPORTED_METHOD`, `UNSUPPORTED_VERSION`, `WALLET_LOCKED`, `WRONG_NETWORK`,
`USER_REJECTED`, `BUSY`, `CONTEXT_CHANGED`, `NOT_CONNECTED`, or `TIMEOUT`. The
injected wallet bridge correlates individual requests, limits envelopes to 1 MiB
and operations to five minutes. Messages retain the 1 KiB limit. The SDK does
not retry signing or submission. A submission timeout has an unknown outcome;
check the transaction on-chain before considering resubmission.

Navigation, tab changes, locking and account/network changes can cancel pending
requests. Only HTTPS top-level documents are supported in production. Iframes
cannot access native wallet messaging. Android without secure native message
origin support reports unavailable. The wallet feature is initially off in
production; SDK discovery then reports unavailable too.

## Platform notes

Freighter mobile is a React Native app on both iOS and Android, so the only
transport is `window.ReactNativeWebView.postMessage` from the page and
`injectJavaScript` from the wallet. The wallet delivers replies by calling a
function on the page directly, not by dispatching a `message` event, so the
Android-fires-on-`document` / iOS-fires-on-`window` split that generic WebView
providers must listen for does not exist here. `window.webkit.messageHandlers`
is never used.

## Security model

- The wallet injects `window.stellar` before content loads for every document
  and activates it (sets `documentToken` and `protocolVersion`) only after
  verifying the top-level HTTPS origin natively. Iframes never get a bridge.
- Every request carries the per-document token; a navigation, origin change or
  wallet context change invalidates the token and rejects pending requests with
  `CONTEXT_CHANGED`.
- The SDK keeps no state of its own: every call reads `window.stellar` and
  refuses to talk to anything but a wallet-activated protocol version 1 bridge.
- Origin allow-listing on the page side is unnecessary: the page cannot receive
  a reply the wallet did not address to its own token, and the wallet enforces
  origins itself.
- Connecting does not authenticate a session. Sign a server-issued challenge
  (SEP-10) and verify it server-side before granting access.

## Development

From this repository:

```sh
npm install
npm test
npm run build
npm pack
```

`npm pack` builds declarations and JavaScript; no runtime dependencies are
needed.

CI (`.github/workflows/ci.yml`) runs `npm test` on every pull request. Every
push to `main` runs `.github/workflows/publish.yml`: it bumps the patch
version, pushes the bump commit, and publishes to npm with provenance. Never
bump the version by hand; the workflow owns it. Publishing uses npm trusted
publishing (OIDC), so the `@xoxno/freighter-webview-provider` package must list
this repository and workflow as a trusted publisher on npmjs.com. Native transport, signature validity, origin enforcement and device
behavior are tested by the Freighter mobile integration suite; SDK tests
exercise its public adapter.

For local mobile integration, keep this checkout next to `freighter-mobile`
and build it before starting the mobile repository's mock dApp:

```text
GitHub/
├── freighter-mobile/
└── freighter-webview-provider/
```
