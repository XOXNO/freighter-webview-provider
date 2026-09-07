/** Wire protocol shared with the wallet's injected bootstrap. */
export const PROTOCOL = 'freighter-webview';
export const PROTOCOL_VERSION = 1;

/** Identity of the object the wallet installs as `window.stellar`. */
export const PROVIDER = 'freighter';
export const PLATFORM = 'mobile';

export const METHOD = {
  CONNECT: 'freighter_connect',
  GET_ACCOUNT: 'freighter_getAccount',
  DISCONNECT: 'freighter_disconnect',
  SIGN_XDR: 'stellar_signXDR',
  SIGN_AND_SUBMIT_XDR: 'stellar_signAndSubmitXDR',
  SIGN_MESSAGE: 'stellar_signMessage',
  SIGN_AUTH_ENTRY: 'stellar_signAuthEntry',
} as const;

export const EVENT = {
  ACCOUNTS_CHANGED: 'accountsChanged',
  CHAIN_CHANGED: 'chainChanged',
  DISCONNECT: 'disconnect',
} as const;

export const ERROR_CODE = {
  UNAVAILABLE: 'UNAVAILABLE',
  INVALID_PARAMS: 'INVALID_PARAMS',
  UNSUPPORTED_METHOD: 'UNSUPPORTED_METHOD',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  WALLET_LOCKED: 'WALLET_LOCKED',
  WRONG_NETWORK: 'WRONG_NETWORK',
  USER_REJECTED: 'USER_REJECTED',
  BUSY: 'BUSY',
  CONTEXT_CHANGED: 'CONTEXT_CHANGED',
  NOT_CONNECTED: 'NOT_CONNECTED',
  TIMEOUT: 'TIMEOUT',
} as const;

export const CHAIN_ID = {
  PUBNET: 'stellar:pubnet',
  TESTNET: 'stellar:testnet',
} as const;

export const NETWORK_PASSPHRASE = {
  PUBNET: 'Public Global Stellar Network ; September 2015',
  TESTNET: 'Test SDF Network ; September 2015',
} as const;

export const CHAIN_ID_BY_PASSPHRASE = {
  [NETWORK_PASSPHRASE.PUBNET]: CHAIN_ID.PUBNET,
  [NETWORK_PASSPHRASE.TESTNET]: CHAIN_ID.TESTNET,
} as const;

/** The wallet activates the document shortly after injecting the bootstrap; `init()` polls for that. */
export const DISCOVERY_TIMEOUT_MS = 2_000;
export const DISCOVERY_POLL_MS = 25;

/** Limits enforced by the wallet; exposed so dApps can validate before asking. */
export const MAX_MESSAGE_BYTES = 1024;
export const MAX_ENVELOPE_BYTES = 1024 * 1024;
export const REQUEST_DEADLINE_MS = 5 * 60 * 1000;
