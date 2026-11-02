import type { BackgroundRequest, BackgroundResponse, ContentRequest } from '../shared/protocol';

export const WA_ORIGIN = 'https://web.whatsapp.com/';

/** Pestaña de WhatsApp Web: la activa si lo es; si no, la primera abierta. */
export async function findWhatsAppTab(): Promise<chrome.tabs.Tab | null> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.url?.startsWith(WA_ORIGIN)) return active;
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  return tabs[0] ?? null;
}

export class TabMessageError extends Error {
  constructor(message: string, readonly kind: 'no-receiver' | 'timeout' | 'other') {
    super(message);
  }
}

export async function sendToTab<T>(tabId: number, req: ContentRequest, timeoutMs = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TabMessageError('WhatsApp Web no respondió a tiempo.', 'timeout')), timeoutMs);
  });
  try {
    const res = await Promise.race([chrome.tabs.sendMessage(tabId, req), timeout]);
    if (res === undefined) throw new TabMessageError('Sin respuesta del script de la página.', 'no-receiver');
    return res as T;
  } catch (e) {
    if (e instanceof TabMessageError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/Receiving end does not exist|Could not establish connection/i.test(msg)) {
      throw new TabMessageError('La extensión aún no está activa en esta pestaña.', 'no-receiver');
    }
    throw new TabMessageError(msg, 'other');
  } finally {
    clearTimeout(timer);
  }
}

export async function sendToBackground(req: BackgroundRequest): Promise<BackgroundResponse> {
  try {
    return (await chrome.runtime.sendMessage(req)) as BackgroundResponse;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Service worker no disponible' };
  }
}
