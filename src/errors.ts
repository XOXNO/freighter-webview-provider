import { ERROR_CODE } from './constants';
import type { BridgeError, ErrorCode } from './types';

export class WebViewProviderError extends Error {
  override readonly name = 'WebViewProviderError';

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

const KNOWN_CODES = new Set<unknown>(Object.values(ERROR_CODE));

/**
 * The bridge rejects with plain `{ code, message }` objects (not `Error`s).
 * Normalize once at the SDK boundary so callers can rely on `instanceof` and a
 * stable `code`; anything else becomes UNAVAILABLE with the original as `cause`.
 */
export const toProviderError = (cause: unknown): WebViewProviderError => {
  const { code, message } = (cause ?? {}) as Partial<BridgeError>;
  if (code && KNOWN_CODES.has(code)) {
    return new WebViewProviderError(code, message ?? code, cause);
  }
  return new WebViewProviderError(
    ERROR_CODE.UNAVAILABLE,
    cause instanceof Error ? cause.message : 'Wallet bridge unavailable',
    cause,
  );
};
