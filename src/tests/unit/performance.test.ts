import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { readSnapshot } from '../../adapters/whatsapp/dom';
import { ConversationStore } from '../../content/conversationStore';
import { buildExportDocument } from '../../export/document';
import { formatTxt } from '../../export/txt';
import { formatJson } from '../../export/json';
import { simDom } from './helpers';
import { generateMessages, individualChat, NOW } from '../fixtures/generators';

/**
 * Rendimiento en jsdom (bastante más lento que Chrome real). Los tiempos se
 * imprimen para el informe; las cotas son holgadas para no ser frágiles.
 * La medición en Chrome real está en las pruebas Playwright.
 */
describe('tamaños de conversación', () => {
  for (const n of [0, 1, 100, 1000, 5000]) {
    it(`${n} mensajes: extracción + normalización + TXT + JSON`, () => {
      const items = generateMessages(n);
      const tBuild = performance.now();
      const { doc } = simDom(individualChat(items, { initialWindow: n }));
      const tRead = performance.now();
      const heapBefore = process.memoryUsage().heapUsed;
      const snap = readSnapshot(doc, NOW);
      const t1 = performance.now();
      const store = new ConversationStore(snap.chat!);
      store.ingest(snap, NOW, 'es', 'newer');
      const t2 = performance.now();
      const docExport = buildExportDocument(store.toSnapshot(n, 0, NOW.getTime()), { range: { mode: 'loaded' }, settings: DEFAULT_SETTINGS, now: NOW });
      const txt = formatTxt(docExport);
      const json = formatJson(docExport, '1.0.0');
      const t3 = performance.now();
      const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
      console.log(
        `[perf] ${n} mensajes · montar DOM simulado ${(tRead - tBuild).toFixed(0)} ms · leer DOM ${(t1 - tRead).toFixed(0)} ms · normalizar+deduplicar ${(t2 - t1).toFixed(0)} ms · TXT+JSON ${(t3 - t2).toFixed(0)} ms · TXT ${(txt.length / 1024).toFixed(0)} KB · JSON ${(json.length / 1024).toFixed(0)} KB · heap Δ ${heapMb.toFixed(1)} MB`,
      );
      const texts = store.messages.filter((m) => m.direction !== 'system').map((m) => m.text);
      expect(texts).toEqual(items.map((i) => i.text));
      expect(docExport.messages.filter((m) => m.direction !== 'system')).toHaveLength(n);
      expect(t2 - t1).toBeLessThan(3000);
      expect(t3 - t2).toBeLessThan(3000);
    }, 180_000);
  }
});
