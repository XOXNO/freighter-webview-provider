import {
  CHAIN_ID,
  ERROR_CODE,
  EVENT,
  METHOD,
  NETWORK_PASSPHRASE,
  PLATFORM,
  PROVIDER,
} from './constants';

type ValueOf<T> = T[keyof T];

export type ChainId = ValueOf<typeof CHAIN_ID>;
export type NetworkPassphrase = ValueOf<typeof NETWORK_PASSPHRASE>;
export type Method = ValueOf<typeof METHOD>;
export type ProviderEvent = ValueOf<typeof EVENT>;
export type ErrorCode = ValueOf<typeof ERROR_CODE>;

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

export interface ConnectResult extends Account {
  auth?: Sep10Auth;
}

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

export interface SignXDRResult {
  signedXDR: string;
}

export interface SubmitResult {
  status: 'success';
}

export interface SignMessageResult {
  signature: string;
}

export interface SignAuthEntryResult {
  signedAuthEntry: string;
  signerAddress: string;
}

/** Every bridge method with its params and result. */
export interface RequestMap {
  [METHOD.CONNECT]: { params: undefined; result: ConnectResult };
  [METHOD.GET_ACCOUNT]: { params: undefined; result: Account };
  [METHOD.DISCONNECT]: { params: undefined; result: boolean };
  [METHOD.SIGN_XDR]: { params: XDRParams; result: SignXDRResult };
  [METHOD.SIGN_AND_SUBMIT_XDR]: { params: XDRParams; result: SubmitResult };
  [METHOD.SIGN_MESSAGE]: { params: MessageParams; result: SignMessageResult };
  [METHOD.SIGN_AUTH_ENTRY]: {
    params: AuthEntryParams;
    result: SignAuthEntryResult;
  };
}

export type MethodParams<M extends Method> = RequestMap[M]['params'];
export type MethodResult<M extends Method> = RequestMap[M]['result'];

/** Rejection shape the wallet bridge uses; normalized to `WebViewProviderError` at the SDK boundary. */
export interface BridgeError {
  code: ErrorCode;
  message: string;
}

export interface EventMap {
  [EVENT.ACCOUNTS_CHANGED]: Account;
  [EVENT.CHAIN_CHANGED]: Account;
  [EVENT.DISCONNECT]: BridgeError;
}

export type ProviderListener<E extends ProviderEvent> = (
  data: EventMap[E],
) => void;

/** What production Freighter installs on every page: identity only, no bridge. */
export interface Beacon {
  readonly provider: typeof PROVIDER;
  readonly platform: typeof PLATFORM;
  readonly version: string;
}

/**
 * `window.stellar` once the wallet's bootstrap ran. The transport (request
 * correlation, size limits, deadlines) lives in that bootstrap; `protocolVersion`
 * and `documentToken` appear only once the wallet activates the document.
 */
export interface InjectedBridge extends Beacon {
  readonly protocolVersion?: number;
  readonly documentToken?: string;
  request<M extends Method>(input: {
    method: M;
    params?: MethodParams<M>;
  }): Promise<MethodResult<M>>;
  on<E extends ProviderEvent>(event: E, listener: ProviderListener<E>): void;
  off<E extends ProviderEvent>(event: E, listener: ProviderListener<E>): void;
}

export type WalletGlobal = typeof globalThis & {
  stellar?: Beacon | InjectedBridge;
};
