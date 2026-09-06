/** Wallet error codes; the union stays open so a newer wallet can add codes without breaking callers. */
export type ErrorCode =
  | 'UNAVAILABLE'
  | 'INVALID_PARAMS'
  | 'UNSUPPORTED_METHOD'
  | 'UNSUPPORTED_VERSION'
  | 'WALLET_LOCKED'
  | 'WRONG_NETWORK'
  | 'USER_REJECTED'
  | 'BUSY'
  | 'CONTEXT_CHANGED'
  | 'NOT_CONNECTED'
  | 'TIMEOUT'
  | (string & {});

export class WebViewProviderError extends Error {
  readonly code: ErrorCode;

  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'WebViewProviderError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * The bridge rejects with plain `{ code, message }` objects (no stack, not an
 * `Error`). Normalize once at the SDK boundary so callers can rely on
 * `instanceof` and a stable `code`; anything unrecognizable becomes UNAVAILABLE.
 */
export const toProviderError = (cause: unknown): WebViewProviderError => {
  if (cause && typeof cause === 'object' && 'code' in cause) {
    const { code, message } = cause as { code: unknown; message?: unknown };
    if (typeof code === 'string' && code)
      return new WebViewProviderError(
        code,
        typeof message === 'string' ? message : code,
        cause,
      );
  }
  return new WebViewProviderError(
    'UNAVAILABLE',
    cause instanceof Error ? cause.message : 'Wallet bridge unavailable',
    cause,
  );
};
