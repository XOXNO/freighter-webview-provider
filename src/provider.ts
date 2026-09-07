import { toProviderError, WebViewProviderError } from './errors';
import type {
  Account,
  AuthEntryParams,
  ConnectResult,
  EventListener,
  InjectedBridge,
  MessageParams,
  ProviderEvent,
  RequestMap,
  RequestMethod,
  XDRParams,
} from './types';

const DISCOVERY_TIMEOUT_MS = 2_000;
const DISCOVERY_POLL_MS = 25;

/** The wallet's bootstrap object, present from document start; `documentToken` is set only once the wallet activates the document natively. */
const getBridge = (): InjectedBridge | undefined => {
  if (typeof window === 'undefined') return undefined;
  const bridge = (window as Window & { stellar?: Partial<InjectedBridge> })
    .stellar;
  return bridge?.provider === 'freighter' &&
    bridge.platform === 'mobile' &&
    typeof bridge.request === 'function' &&
    typeof bridge.on === 'function' &&
    typeof bridge.off === 'function'
    ? (bridge as InjectedBridge)
    : undefined;
};

const activeBridge = (): InjectedBridge | undefined => {
  const bridge = getBridge();
  return bridge?.protocolVersion === 1 && bridge.documentToken
    ? bridge
    : undefined;
};

/**
 * Thin SDK over the wallet's document-scoped, correlated native bridge.
 *
 * Security lives on the native side: the wallet activates `window.stellar`
 * only for HTTPS top-level documents whose origin it verified, scopes every
 * request to a per-document token, and requires native approval for each
 * signature. The SDK holds no state of its own beyond the page's bridge.
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
      if (typeof window === 'undefined' || Date.now() >= deadline) return false;
      await new Promise((resolve) => {
        setTimeout(resolve, DISCOVERY_POLL_MS);
      });
    }
    return true;
  }

  private async request<M extends RequestMethod>(
    method: M,
    params?: RequestMap[M]['params'],
  ): Promise<RequestMap[M]['result']> {
    const bridge = activeBridge();
    if (!bridge) {
      throw new WebViewProviderError(
        'UNAVAILABLE',
        'Call init() in a supported Freighter WebView first',
      );
    }
    try {
      return (await bridge.request({
        method,
        params,
      })) as RequestMap[M]['result'];
    } catch (cause) {
      throw toProviderError(cause);
    }
  }

  connect(): Promise<ConnectResult> {
    return this.request('freighter_connect');
  }

  getAccount(): Promise<Account> {
    return this.request('freighter_getAccount');
  }

  signXDR(params: XDRParams): Promise<{ signedXDR: string }> {
    return this.request('stellar_signXDR', params);
  }

  signAndSubmitXDR(params: XDRParams): Promise<{ status: 'success' }> {
    return this.request('stellar_signAndSubmitXDR', params);
  }

  signMessage(params: MessageParams): Promise<{ signature: string }> {
    return this.request('stellar_signMessage', params);
  }

  signAuthEntry(params: AuthEntryParams): Promise<{
    signedAuthEntry: string;
    signerAddress: string;
  }> {
    return this.request('stellar_signAuthEntry', params);
  }

  async disconnect(): Promise<void> {
    await this.request('freighter_disconnect');
  }

  /** Listeners attach to the page's bridge object directly, so subscribing before `init()` is fine. */
  on<E extends ProviderEvent>(event: E, listener: EventListener<E>): void {
    getBridge()?.on(event, listener);
  }

  off<E extends ProviderEvent>(event: E, listener: EventListener<E>): void {
    getBridge()?.off(event, listener);
  }
}
