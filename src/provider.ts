import {
  DISCOVERY_POLL_MS,
  DISCOVERY_TIMEOUT_MS,
  ERROR_CODE,
  METHOD,
  PLATFORM,
  PROTOCOL_VERSION,
  PROVIDER,
} from './constants';
import { toProviderError, WebViewProviderError } from './errors';
import type {
  Account,
  AuthEntryParams,
  ConnectResult,
  InjectedBridge,
  MessageParams,
  Method,
  MethodParams,
  MethodResult,
  ProviderEvent,
  ProviderListener,
  SignAuthEntryResult,
  SignMessageResult,
  SignXDRResult,
  SubmitResult,
  WalletGlobal,
  XDRParams,
} from './types';

/** The wallet's bootstrap object, present from document start in a bridged WebView. */
const bridge = (): InjectedBridge | undefined => {
  const candidate = (globalThis as WalletGlobal).stellar;
  return candidate?.provider === PROVIDER &&
    candidate.platform === PLATFORM &&
    'request' in candidate
    ? candidate
    : undefined;
};

/** The bridge once the wallet activated this document natively. */
const activeBridge = (): InjectedBridge | undefined => {
  const candidate = bridge();
  return candidate?.protocolVersion === PROTOCOL_VERSION &&
    candidate.documentToken
    ? candidate
    : undefined;
};

/** Synchronous: true inside a Freighter WebView that injects the bridge (not the beacon-only production shell). */
export const isFreighterWebView = (): boolean => bridge() !== undefined;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Thin SDK over the wallet's document-scoped, correlated native bridge.
 *
 * Security lives on the native side: the wallet activates `window.stellar`
 * only for HTTPS top-level documents whose origin it verified, scopes every
 * request to a per-document token, and requires native approval for each
 * signature. The SDK holds no state beyond the page's bridge.
 */
export class FreighterWebViewProvider {
  private static instance?: FreighterWebViewProvider;

  /** One provider per page. */
  static getInstance(): FreighterWebViewProvider {
    FreighterWebViewProvider.instance ??= new FreighterWebViewProvider();
    return FreighterWebViewProvider.instance;
  }

  /** Resolves true once the wallet activated this document; false outside supported WebViews. Never prompts. */
  async init(): Promise<boolean> {
    const deadline = Date.now() + DISCOVERY_TIMEOUT_MS;
    while (!activeBridge()) {
      if (!bridge() || Date.now() >= deadline) return false;
      await sleep(DISCOVERY_POLL_MS);
    }
    return true;
  }

  private async request<M extends Method>(
    method: M,
    params?: MethodParams<M>,
  ): Promise<MethodResult<M>> {
    const active = activeBridge();
    if (!active) {
      throw new WebViewProviderError(
        ERROR_CODE.UNAVAILABLE,
        'Call init() in a supported Freighter WebView first',
      );
    }
    try {
      return await active.request({ method, params });
    } catch (cause) {
      throw toProviderError(cause);
    }
  }

  connect(): Promise<ConnectResult> {
    return this.request(METHOD.CONNECT);
  }

  getAccount(): Promise<Account> {
    return this.request(METHOD.GET_ACCOUNT);
  }

  signXDR(params: XDRParams): Promise<SignXDRResult> {
    return this.request(METHOD.SIGN_XDR, params);
  }

  signAndSubmitXDR(params: XDRParams): Promise<SubmitResult> {
    return this.request(METHOD.SIGN_AND_SUBMIT_XDR, params);
  }

  signMessage(params: MessageParams): Promise<SignMessageResult> {
    return this.request(METHOD.SIGN_MESSAGE, params);
  }

  signAuthEntry(params: AuthEntryParams): Promise<SignAuthEntryResult> {
    return this.request(METHOD.SIGN_AUTH_ENTRY, params);
  }

  async disconnect(): Promise<void> {
    await this.request(METHOD.DISCONNECT);
  }

  /** Listeners attach to the page's bridge object directly, so subscribing before `init()` is fine. */
  on<E extends ProviderEvent>(event: E, listener: ProviderListener<E>): void {
    bridge()?.on(event, listener);
  }

  off<E extends ProviderEvent>(event: E, listener: ProviderListener<E>): void {
    bridge()?.off(event, listener);
  }
}
