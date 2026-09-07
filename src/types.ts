import type { ErrorCode } from './errors';

export type ChainId = 'stellar:pubnet' | 'stellar:testnet';

export interface Account {
  address: string;
  chainId: ChainId;
  networkPassphrase: string;
}

/**
 * A SEP-10 challenge the wallet fetched from the site's own
 * `/.well-known/stellar.toml` WEB_AUTH_ENDPOINT, verified against its
 * SIGNING_KEY and countersigned without a prompt. Present on `connect()` only
 * when the wallet allows silent sign-in for the document; verify it locally
 * and submit it to your session endpoint like a challenge you fetched yourself.
 */
export interface Sep10Auth {
  challengeXdr: string;
  signedXdr: string;
  networkPassphrase: string;
  homeDomain: string;
  webAuthEndpoint: string;
}

export type ConnectResult = Account & { auth?: Sep10Auth };

export interface XDRParams {
  xdr: string;
  chainId: ChainId;
}

export interface MessageParams {
  message: string;
  chainId: ChainId;
}

export interface AuthEntryParams {
  entryXdr: string;
  chainId: ChainId;
}

/** Every bridge method with its params and result, in the wallet's own names. */
export interface RequestMap {
  freighter_getCapabilities: {
    params: undefined;
    result: { protocolVersion: number };
  };
  freighter_connect: { params: undefined; result: ConnectResult };
  freighter_getAccount: { params: undefined; result: Account };
  freighter_disconnect: { params: undefined; result: unknown };
  stellar_signXDR: { params: XDRParams; result: { signedXDR: string } };
  stellar_signAndSubmitXDR: {
    params: XDRParams;
    result: { status: 'success' };
  };
  stellar_signMessage: { params: MessageParams; result: { signature: string } };
  stellar_signAuthEntry: {
    params: AuthEntryParams;
    result: { signedAuthEntry: string; signerAddress: string };
  };
}

export type RequestMethod = keyof RequestMap;

export interface EventMap {
  accountsChanged: Account;
  chainChanged: Account;
  disconnect: { code: ErrorCode; message: string };
}

export type ProviderEvent = keyof EventMap;

export type EventListener<E extends ProviderEvent = ProviderEvent> = (
  data: EventMap[E],
) => void;

/**
 * Shape of `window.stellar` once the wallet activates the document. The
 * transport (request correlation, size limits, 5-minute deadlines) lives in the
 * wallet's injected bootstrap, so the SDK never touches
 * `ReactNativeWebView.postMessage` or `message` events itself.
 */
export interface InjectedBridge {
  provider: string;
  platform: string;
  version: string;
  protocolVersion: 1;
  documentToken: string;
  request(input: { method: string; params?: unknown }): Promise<unknown>;
  on(event: ProviderEvent, listener: (data: never) => void): void;
  off(event: ProviderEvent, listener: (data: never) => void): void;
}
