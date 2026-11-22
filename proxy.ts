/**
 * Optional outbound-proxy support.
 *
 * Node's global fetch does not read HTTPS_PROXY on its own, so an app deployed
 * behind a corporate proxy would silently fail to reach the Gemini API. When
 * HTTPS_PROXY (or HTTP_PROXY) is set we route fetch through it; with no proxy
 * configured this file does nothing.
 */
import { ProxyAgent, setGlobalDispatcher } from 'undici';

export function installProxyFromEnv(): string | null {
  const url = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy;
  if (!url) return null;
  try {
    setGlobalDispatcher(new ProxyAgent(url));
    return new URL(url).host;
  } catch {
    console.warn('[november-ai] Ignoring an unreadable proxy setting.');
    return null;
  }
}
