import { JSDOM } from 'jsdom';
import { installWhatsAppSim, type SimConfig } from '../fixtures/waSim';
import { readSnapshot } from '../../adapters/whatsapp/dom';
import { ConversationStore } from '../../content/conversationStore';
import { NOW } from '../fixtures/generators';

export function blankDom(): JSDOM {
  return new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://web.whatsapp.com/', pretendToBeVisual: true });
}

export function simDom(config: SimConfig): { dom: JSDOM; doc: Document } {
  const dom = blankDom();
  installWhatsAppSim(config, dom.window.document);
  return { dom, doc: dom.window.document };
}

export function htmlDom(html: string): Document {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;
}

/** Lee el DOM simulado y devuelve la conversación normalizada. */
export function extractFromSim(config: SimConfig) {
  const { doc } = simDom(config);
  const snap = readSnapshot(doc, NOW);
  if (!snap.chat) throw new Error('sin chat');
  const store = new ConversationStore(snap.chat);
  store.ingest(snap, NOW, 'es', 'newer');
  return { doc, snap, store };
}
