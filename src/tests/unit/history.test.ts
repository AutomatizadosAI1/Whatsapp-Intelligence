import { describe, expect, it } from 'vitest';
import type { JobStatus } from '../../shared/types';
import { readSnapshot } from '../../adapters/whatsapp/dom';
import { ConversationStore } from '../../content/conversationStore';
import { runHistory, type HistoryOptions } from '../../content/historyEngine';
import { abortableSleep, createDomDriver } from '../../content/domDriver';
import { simDom } from './helpers';
import { generateMessages, individualChat, NOW } from '../fixtures/generators';
import type { SimConfig } from '../fixtures/waSim';

const FAST = { maxNoProgress: 4, baseWaitMs: 40, maxWaitMs: 120, settleMs: 2, checkpointEvery: 2 };

function setup(config: SimConfig) {
  const { dom, doc } = simDom(config);
  const snap = readSnapshot(doc, NOW);
  const store = new ConversationStore(snap.chat!);
  const driver = createDomDriver(doc, () => NOW);
  const progress: JobStatus[] = [];
  let checkpoints = 0;
  const run = (opts: Partial<HistoryOptions> = {}, signal = new AbortController().signal) =>
    runHistory(
      {
        jobId: 'test',
        chatKey: snap.chat!.key,
        targetDate: null,
        timeLimitMs: 60_000,
        messageLimit: 100_000,
        scrollBackWhenDone: true,
        ...FAST,
        ...opts,
      },
      {
        driver,
        store,
        now: Date.now,
        nowDate: () => NOW,
        locale: 'es',
        sleep: abortableSleep,
        onProgress: (s) => progress.push(s),
        saveCheckpoint: async () => {
          checkpoints++;
        },
      },
      signal,
    );
  return { dom, doc, store, run, progress, checkpoints: () => checkpoints };
}

const textsOf = (store: ConversationStore) => store.messages.filter((m) => m.direction !== 'system').map((m) => m.text);

describe('recuperación de historial (DOM simulado con carga perezosa)', () => {
  it('recupera 1000 mensajes con virtualización y llega al inicio con evidencia', async () => {
    const items = generateMessages(1000);
    const { store, run, progress, checkpoints } = setup(individualChat(items, { initialWindow: 40, pageSize: 50, virtualizeMax: 120, loadDelayMs: 5 }));
    const result = await run();
    expect(result.stopReason).toBe('start-reached');
    expect(result.state).toBe('done');
    expect(store.startReached).toBe(true);
    expect(store.coverage()).toBe('start-reached');
    expect(textsOf(store)).toEqual(items.map((i) => i.text));
    expect(progress.length).toBeGreaterThan(5);
    expect(checkpoints()).toBeGreaterThan(0);
    expect(store.gapSuspected).toBe(false);
  });

  it('para cuando el scroll no progresa y NO declara el historial completo', async () => {
    const { store, run } = setup(individualChat(generateMessages(300), { initialWindow: 40, stall: true }));
    const result = await run({ timeLimitMs: 3000 });
    // El spinner eterno no cuenta como "sin progreso"; acaba por límite de tiempo.
    expect(['time-limit', 'no-progress']).toContain(result.stopReason);
    expect(store.startReached).toBe(false);
    expect(store.coverage()).toBe('partial');
    expect(textsOf(store)).toHaveLength(40);
  });

  it('sin más carga y sin evidencia de inicio -> no-progress', async () => {
    const { store, run } = setup(individualChat(generateMessages(50), { initialWindow: 50, topBehavior: 'nothing' }));
    const result = await run();
    expect(result.stopReason).toBe('no-progress');
    expect(store.coverage()).toBe('partial');
  });

  it('botón de sincronizar con el teléfono -> phone-sync-required', async () => {
    const { run } = setup(individualChat(generateMessages(120), { initialWindow: 40, pageSize: 60, topBehavior: 'phone-sync', loadDelayMs: 5 }));
    const result = await run();
    expect(result.stopReason).toBe('phone-sync-required');
  });

  it('cancelación conserva lo capturado', async () => {
    const { store, run } = setup(individualChat(generateMessages(3000), { initialWindow: 40, pageSize: 30, loadDelayMs: 40 }));
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 400);
    const result = await run({}, controller.signal);
    expect(result.stopReason).toBe('cancelled');
    expect(result.state).toBe('cancelled');
    expect(store.messages.length).toBeGreaterThan(40);
    expect(store.messages.length).toBeLessThan(3000);
    expect(result.captured).toBe(store.messages.length);
  });

  it('cambio de chat a mitad: se detiene y no mezcla conversaciones', async () => {
    const a = generateMessages(2000);
    const { dom, store, run } = setup(individualChat(a, { initialWindow: 40, pageSize: 30, loadDelayMs: 30 }));
    setTimeout(() => {
      (dom.window as unknown as { __waSim: { switchChat(c: SimConfig): void } }).__waSim.switchChat({
        chatName: 'Otro Chat Ficticio',
        chatJid: '34699999999@c.us',
        items: generateMessages(20, { seed: 3 }).map((x) => ({ ...x, text: `OTRO ${x.text}` })),
        today: '2026-11-02',
      });
    }, 300);
    const result = await run();
    expect(result.stopReason).toBe('chat-changed');
    expect(result.state).toBe('error');
    expect(store.messages.every((m) => m.chatKey === '34600000001@c.us')).toBe(true);
    expect(textsOf(store).some((t) => t.startsWith('OTRO'))).toBe(false);
  });

  it('se detiene al alcanzar la fecha inicial del rango', async () => {
    const items = generateMessages(600, { perDay: 20 }); // 30 días
    const { store, run } = setup(individualChat(items, { initialWindow: 40, pageSize: 40, loadDelayMs: 5 }));
    const result = await run({ targetDate: '2026-10-27' });
    expect(result.stopReason).toBe('target-date-reached');
    expect(store.oldestDate()! < '2026-10-27').toBe(true);
    expect(store.messages.length).toBeLessThan(600);
  });

  it('respeta el límite de mensajes', async () => {
    const { run } = setup(individualChat(generateMessages(1000), { initialWindow: 40, pageSize: 50, loadDelayMs: 5 }));
    const result = await run({ messageLimit: 200 });
    expect(result.stopReason).toBe('message-limit');
  });

  it('reanudación: una segunda pasada sobre lo ya guardado no duplica', async () => {
    const items = generateMessages(400);
    const first = setup(individualChat(items, { initialWindow: 40, pageSize: 50, loadDelayMs: 5 }));
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 120);
    await first.run({}, controller.signal);
    const partial = first.store.toCheckpoint(Date.now());
    // Recarga de la página: DOM nuevo, almacén restaurado desde checkpoint.
    const second = setup(individualChat(items, { initialWindow: 40, pageSize: 50, loadDelayMs: 5 }));
    second.store.restore(partial);
    const result = await second.run();
    expect(result.stopReason).toBe('start-reached');
    expect(textsOf(second.store)).toEqual(items.map((i) => i.text));
  });
});
