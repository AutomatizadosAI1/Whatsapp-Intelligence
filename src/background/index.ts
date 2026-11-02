/**
 * Service worker: custodia las copias temporales en chrome.storage.session
 * (memoria, sin disco) y las caduca. No guarda estado propio entre eventos,
 * así que la suspensión del service worker no pierde nada.
 */
import type { BackgroundRequest, BackgroundResponse } from '../shared/protocol';
import { isBackgroundRequest } from '../shared/protocol';
import { SessionCheckpointStore } from '../storage/checkpointStore';
import { loadSettings } from '../storage/settings';

const store = new SessionCheckpointStore(chrome.storage.session, async () => (await loadSettings()).checkpointTtlHours * 3_600_000);

function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const url = sender.url ?? '';
  return url.startsWith('https://web.whatsapp.com/') || url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

async function handle(req: BackgroundRequest): Promise<BackgroundResponse> {
  switch (req.type) {
    case 'WAI_CP_SAVE': {
      const r = await store.save(req.checkpoint);
      return r.ok ? { ok: true, bytes: r.bytes } : { ok: false, error: r.error };
    }
    case 'WAI_CP_LOAD':
      return { ok: true, checkpoint: await store.load(req.chatKey) };
    case 'WAI_CP_DELETE':
      await store.remove(req.chatKey);
      return { ok: true };
    case 'WAI_CP_CLEAR_ALL':
      await store.clearAll();
      return { ok: true };
    case 'WAI_CP_STATS': {
      const s = await store.stats();
      return { ok: true, count: s.count, bytes: s.bytes };
    }
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isBackgroundRequest(message) || !trustedSender(sender)) return false;
  handle(message)
    .then(sendResponse)
    .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : 'Error interno' }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void store.purgeExpired();
});

chrome.runtime.onStartup.addListener(() => {
  void store.purgeExpired();
});
