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

const getBridge = (): InjectedBridge | undefined => {
  if (typeof window === 'undefined') return undefined;
  const bridge = (window as Window & { stellar?: Partial<InjectedBridge> })
    .stellar;
  if (
    bridge?.provider !== 'freighter' ||
    bridge.platform !== 'mobile' ||
    bridge.protocolVersion !== 1 ||
    typeof bridge.documentToken !== 'string' ||
    !bridge.documentToken ||
    typeof bridge.request !== 'function' ||
    typeof bridge.on !== 'function' ||
    typeof bridge.off !== 'function'
  ) {
    return undefined;
  }
  return bridge as InjectedBridge;
};

/**
 * Thin SDK over the wallet's document-scoped, correlated native bridge.
 *
 * Security lives on the native side: the wallet activates `window.stellar`
 * only for HTTPS top-level documents whose origin it verified, scopes every
 * request to a per-document token, and requires native approval for each
 * signature. The SDK adds no trust of its own; it only refuses to talk to a
 * bridge it has not negotiated with.
 */
export class FreighterWebViewProvider {
  private static instance?: FreighterWebViewProvider;

  private bridge?: InjectedBridge;

  private initializing?: Promise<boolean>;

  private listeners = new Map<ProviderEvent, Set<(data: never) => void>>();

  /** One provider per page keeps event subscriptions and discovery shared. */
  static getInstance(): FreighterWebViewProvider {
    FreighterWebViewProvider.instance ??= new FreighterWebViewProvider();
    return FreighterWebViewProvider.instance;
  }

  /** Returns false outside supported WebViews; never prompts or returns keys. */
  init(): Promise<boolean> {
    if (this.bridge && this.bridge === getBridge())
      return Promise.resolve(true);
    if (!this.initializing) {
      this.initializing = this.discover().finally(() => {
        this.initializing = undefined;
      });
    }
    return this.initializing;
  }

  private async discover(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const deadline = Date.now() + DISCOVERY_TIMEOUT_MS;
    let candidate = getBridge();
    while (!candidate && Date.now() < deadline) {
      await new Promise((resolve) => {
        setTimeout(resolve, DISCOVERY_POLL_MS);
      });
      candidate = getBridge();
    }
    if (!candidate) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const capabilities = await Promise.race([
        candidate.request({ method: 'freighter_getCapabilities' }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new WebViewProviderError('TIMEOUT', 'Discovery timed out'),
              ),
            Math.max(0, deadline - Date.now()),
          );
        }),
      ]);
      if (
        (capabilities as { protocolVersion?: unknown } | null)
          ?.protocolVersion !== 1 ||
        candidate !== getBridge()
      ) {
        return false;
      }
      this.listeners.forEach((listeners, event) => {
        listeners.forEach((listener) => {
          this.bridge?.off(event, listener);
          candidate.on(event, listener);
        });
      });
      this.bridge = candidate;
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async request<M extends RequestMethod>(
    method: M,
    params?: RequestMap[M]['params'],
  ): Promise<RequestMap[M]['result']> {
    if (!this.bridge || this.bridge !== getBridge()) {
      throw new WebViewProviderError(
        'UNAVAILABLE',
        'Call init() in a supported Freighter WebView first',
      );
    }
    try {
      return (await this.bridge.request({
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

  on<E extends ProviderEvent>(event: E, listener: EventListener<E>): void {
    const listeners =
      this.listeners.get(event) ?? new Set<(data: never) => void>();
    if (listeners.has(listener)) return;
    listeners.add(listener);
    this.listeners.set(event, listeners);
    this.bridge?.on(event, listener);
  }

  off<E extends ProviderEvent>(event: E, listener: EventListener<E>): void {
    this.listeners.get(event)?.delete(listener);
    this.bridge?.off(event, listener);
  }
}
