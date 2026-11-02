import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import type { Checkpoint, Message } from '../../shared/types';
import { MemoryArea, SessionCheckpointStore, checkpointKey } from '../../storage/checkpointStore';
import { sanitizeSettings } from '../../storage/settings';
import { writeClipboard } from '../../popup/clipboard';
import { collectAudioReferences, noTranscriptionProvider, transcribeAll, type TranscriptionProvider } from '../../audio/provider';
import { ConversationStore } from '../../content/conversationStore';
import { isBackgroundRequest, isContentRequest } from '../../shared/protocol';

function cp(chatKey: string, savedAt: number, n = 3): Checkpoint {
  return {
    version: 1,
    chatKey,
    chatName: 'Chat',
    isGroup: false,
    savedAt,
    messages: Array.from({ length: n }, (_, i) => ({ key: `id:${i}`, chatKey, text: `m${i}` }) as unknown as Message),
    startReached: false,
    historyAttempted: true,
    gapSuspected: false,
    job: null,
  };
}

describe('copias temporales (chrome.storage.session simulado)', () => {
  it('guarda, carga y borra por chat sin mezclar', async () => {
    const area = new MemoryArea();
    const store = new SessionCheckpointStore(area, async () => 3_600_000, () => 1000);
    await store.save(cp('a@c.us', 1000));
    await store.save(cp('b@c.us', 1000, 5));
    expect((await store.load('a@c.us'))?.messages).toHaveLength(3);
    expect((await store.load('b@c.us'))?.messages).toHaveLength(5);
    await store.remove('a@c.us');
    expect(await store.load('a@c.us')).toBeNull();
    expect((await store.stats()).count).toBe(1);
    await store.clearAll();
    expect(area.data.size).toBe(0);
  });

  it('caduca por TTL', async () => {
    let now = 0;
    const store = new SessionCheckpointStore(new MemoryArea(), async () => 1000, () => now);
    await store.save(cp('a@c.us', 0));
    now = 1500;
    expect(await store.load('a@c.us')).toBeNull();
  });

  it('rechaza superar la cuota sin truncar en silencio', async () => {
    const store = new SessionCheckpointStore(new MemoryArea(), async () => 3_600_000, Date.now, 2000);
    const r = await store.save(cp('a@c.us', Date.now(), 100));
    expect(r.ok).toBe(false);
  });

  it('informa del error de escritura', async () => {
    const area = new MemoryArea();
    area.failNextSet = true;
    const r = await new SessionCheckpointStore(area, async () => 3_600_000).save(cp('a@c.us', Date.now()));
    expect(r).toEqual({ ok: false, error: 'QUOTA_BYTES quota exceeded' });
  });

  it('la clave no expone el identificador del chat', () => {
    expect(checkpointKey('34600000001@c.us')).not.toContain('34600000001');
  });

  it('restaurar marca como interrumpida una recuperación que estaba en curso y filtra otros chats', () => {
    const c = cp('a@c.us', 0);
    c.messages.push({ key: 'id:x', chatKey: 'otro@c.us', text: 'intruso' } as unknown as Message);
    c.job = { jobId: 'j', chatKey: 'a@c.us', state: 'running', startedAt: 0, updatedAt: 0, batches: 3, captured: 3, newInLastBatch: 0, stopReason: null, message: '', tabHidden: false };
    const s = new ConversationStore({ key: 'a@c.us', keySource: 'jid', name: 'A', isGroup: false });
    s.restore(c);
    expect(s.lastJob?.state).toBe('interrupted');
    expect(s.messages).toHaveLength(3);
    expect(() => new ConversationStore({ key: 'b@c.us', keySource: 'jid', name: 'B', isGroup: false }).restore(c)).toThrow('CHAT_MISMATCH');
  });
});

describe('ajustes', () => {
  it('valida y acota valores', () => {
    expect(sanitizeSettings({ senderLabels: 'x', historyTimeLimitMin: 999, checkpointTtlHours: -3 })).toMatchObject({
      senderLabels: 'roles',
      historyTimeLimitMin: 60,
      checkpointTtlHours: 1,
    });
    expect(sanitizeSettings(null).includeSystem).toBe(true);
  });
});

describe('portapapeles', () => {
  const doc = () => new JSDOM('<!doctype html><body></body>').window.document;

  it('éxito solo cuando writeText resuelve', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await writeClipboard('hola', { clipboard: { writeText } })).toEqual({ ok: true, method: 'clipboard-api' });
    expect(writeText).toHaveBeenCalledWith('hola');
  });

  it('si writeText falla usa execCommand y solo confirma si devuelve true', async () => {
    const d = doc();
    const exec = vi.fn().mockReturnValue(true);
    (d as unknown as { execCommand: typeof exec }).execCommand = exec;
    const r = await writeClipboard('texto', { clipboard: { writeText: () => Promise.reject(new Error('Document is not focused')) }, document: d });
    expect(r).toEqual({ ok: true, method: 'exec-command' });
    expect(exec).toHaveBeenCalledWith('copy');
    expect(d.querySelector('textarea')).toBeNull();
  });

  it('si todo falla devuelve error y nunca éxito ficticio', async () => {
    const d = doc();
    (d as unknown as { execCommand: () => boolean }).execCommand = () => false;
    const r = await writeClipboard('texto', { clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) }, document: d });
    expect(r).toEqual({ ok: false, error: 'NotAllowedError' });
  });

  it('sin API asíncrona ni documento', async () => {
    expect((await writeClipboard('x', {})).ok).toBe(false);
  });
});

describe('audio', () => {
  const messages = [
    { key: 'id:1', kind: 'voice', when: { date: '2026-10-25', time: '10:00' } },
    { key: 'id:2', kind: 'text', when: { date: null, time: null } },
    { key: 'id:3', kind: 'audio', when: { date: null, time: '11:00' } },
  ] as unknown as Message[];

  it('reconoce los audios y la V1 no transcribe', async () => {
    const refs = collectAudioReferences(messages);
    expect(refs.map((r) => r.messageKey)).toEqual(['id:1', 'id:3']);
    const r = await transcribeAll(noTranscriptionProvider, refs, { consentGiven: true, signal: new AbortController().signal });
    expect(r).toEqual({ transcriptions: new Map(), failed: 0, skipped: true });
  });

  it('un proveedor remoto exige consentimiento explícito', async () => {
    const remote: TranscriptionProvider = {
      id: 'remoto', label: 'Remoto', remote: true,
      isAvailable: async () => true,
      transcribe: vi.fn(async () => ({ status: 'ok' as const, text: 'hola' })),
    };
    const refs = collectAudioReferences(messages);
    const denied = await transcribeAll(remote, refs, { consentGiven: false, signal: new AbortController().signal });
    expect(denied.skipped).toBe(true);
    expect(remote.transcribe).not.toHaveBeenCalled();
    const ok = await transcribeAll(remote, refs, { consentGiven: true, signal: new AbortController().signal });
    expect([...ok.transcriptions.values()]).toEqual(['hola', 'hola']);
  });
});

describe('protocolo', () => {
  it('distingue mensajes de content script y de service worker', () => {
    expect(isContentRequest({ type: 'WAI_EXTRACT' })).toBe(true);
    expect(isContentRequest({ type: 'WAI_CP_SAVE' })).toBe(false);
    expect(isBackgroundRequest({ type: 'WAI_CP_SAVE' })).toBe(true);
    expect(isContentRequest('WAI_EXTRACT')).toBe(false);
    expect(isContentRequest({ type: 'OTRA_COSA' })).toBe(false);
  });
});
