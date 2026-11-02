/**
 * Content script de web.whatsapp.com. No hace nada hasta recibir una orden del
 * popup de esta extensión: no lee chats en segundo plano ni envía datos fuera.
 */
import type { BackgroundRequest, BackgroundResponse, ContentRequest, DiagnosticsResponse, ExtractResponse, PingResponse, SimpleResponse, StateResponse } from '../shared/protocol';
import { isContentRequest } from '../shared/protocol';
import type { ChatInfo, JobStatus, RangeSelection, Settings } from '../shared/types';
import { collectDiagnostics, countDomMessages, readChatInfo, readSnapshot } from '../adapters/whatsapp/dom';
import { ConversationStore } from './conversationStore';
import { DEFAULT_HISTORY_OPTIONS, runHistory, stopMessage } from './historyEngine';
import { abortableSleep, createDomDriver } from './domDriver';
import { DEFAULT_COLLECTOR_LIMITS, MediaCollector, PageMediaBridge } from './mediaCollector';
import { buildExportDocument } from '../export/document';
import { buildZipBundle } from '../export/zipBundle';
import { buildZip } from '../export/zip';
import { exportFilename } from '../export/filename';
import { rangeBounds } from '../export/range';
import { debug } from '../shared/log';

const VERSION = chrome.runtime.getManifest().version;
const stores = new Map<string, ConversationStore>();
const restoreAttempted = new Set<string>();
let activeJob: { status: JobStatus; controller: AbortController } | null = null;
const mediaBridge = new PageMediaBridge(window);

const locale = () => document.documentElement.lang || navigator.language || null;

async function background(req: BackgroundRequest): Promise<BackgroundResponse> {
  try {
    return (await chrome.runtime.sendMessage(req)) as BackgroundResponse;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Service worker no disponible' };
  }
}

async function getStore(chat: ChatInfo): Promise<ConversationStore> {
  let store = stores.get(chat.key);
  if (!store) {
    store = new ConversationStore(chat);
    stores.set(chat.key, store);
  }
  if (!restoreAttempted.has(chat.key)) {
    restoreAttempted.add(chat.key);
    const r = await background({ type: 'WAI_CP_LOAD', chatKey: chat.key });
    if (r.ok && r.checkpoint && store.messages.length === 0) {
      store.restore(r.checkpoint);
      debug('checkpoint-restored', { count: store.messages.length });
    }
  }
  return store;
}

async function persist(store: ConversationStore): Promise<void> {
  const r = await background({ type: 'WAI_CP_SAVE', checkpoint: store.toCheckpoint(Date.now()) });
  store.checkpointError = r.ok ? null : r.error;
}

function ingestDom(store: ConversationStore): number {
  const dom = readSnapshot(document, new Date());
  if (!dom.chat || dom.chat.key !== store.chat.key) throw new Error('CHAT_MISMATCH');
  store.ingest(dom, new Date(), locale(), 'newer');
  return dom.domCount;
}

function newJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Descarga local del ZIP desde la propia página (sin servidores). */
function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function megabytes(bytes: number): string {
  return `${(bytes / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
}

interface ZipRequest {
  range: RangeSelection;
  targetDate: string | null;
  settings: Settings;
}

/**
 * ZIP para IA: recupera el historial del rango (si no es «Cargados»), descarga
 * la multimedia que va apareciendo y empaqueta texto + archivos.
 */
async function runZipJob(req: ZipRequest, store: ConversationStore, job: { status: JobStatus; controller: AbortController }): Promise<void> {
  const signal = job.controller.signal;
  const bounds = rangeBounds(req.range, new Date());
  const collector: MediaCollector = new MediaCollector(
    document,
    mediaBridge,
    () => store.messages,
    { from: bounds.from, to: bounds.to, ...DEFAULT_COLLECTOR_LIMITS },
    (what) => {
      const st = collector.stats();
      job.status = {
        ...job.status,
        media: st,
        updatedAt: Date.now(),
        message: `Descargando ${what}… (${st.saved} archivos guardados${st.failed ? `, ${st.failed} fallidos` : ''})`,
      };
    },
  );
  const withMedia = (s: JobStatus): JobStatus => ({ ...s, kind: 'zip', media: collector.stats() });
  let history: JobStatus | null = null;
  mediaBridge.arm();
  try {
    if (req.range.mode === 'loaded') {
      ingestDom(store);
      job.status = withMedia({ ...job.status, message: 'Descargando la multimedia visible…' });
      await collector.collectVisible(signal);
    } else {
      history = await runHistory(
        {
          jobId: job.status.jobId,
          chatKey: store.chat.key,
          targetDate: req.targetDate,
          timeLimitMs: (req.settings.historyTimeLimitMin + 30) * 60_000,
          messageLimit: req.settings.historyMessageLimit,
          scrollBackWhenDone: req.settings.scrollBackWhenDone,
          ...DEFAULT_HISTORY_OPTIONS,
        },
        {
          driver: createDomDriver(document, () => new Date()),
          store,
          now: Date.now,
          nowDate: () => new Date(),
          locale: locale(),
          sleep: abortableSleep,
          // El trabajo sigue «en curso» hasta que el ZIP esté descargado.
          onProgress: (s) => {
            job.status = withMedia({ ...s, state: 'running' });
          },
          saveCheckpoint: async () => persist(store),
          afterCapture: (sig) => collector.collectVisible(sig),
        },
        signal,
      );
    }
  } catch {
    debug('zip-capture-error', {});
  } finally {
    mediaBridge.disarm();
  }

  const finish = (state: JobStatus['state'], message: string) => {
    job.status = withMedia({ ...job.status, state, message, updatedAt: Date.now(), captured: store.messages.length });
    store.lastJob = { ...job.status };
  };

  try {
    job.status = withMedia({ ...job.status, message: 'Creando el ZIP…', updatedAt: Date.now() });
    const now = new Date();
    const snapshot = store.toSnapshot(countDomMessages(document), store.messages.length, now.getTime());
    const doc = buildExportDocument(snapshot, { range: req.range, settings: req.settings, now });
    if (doc.messages.length === 0) {
      finish('error', 'No hay mensajes dentro del rango elegido: no se creó el ZIP.');
      return;
    }
    const bundle = buildZipBundle(doc, collector.items, collector.failures, VERSION);
    const blob = await buildZip(bundle.entries, now);
    const filename = exportFilename(store.chat.name, now, 'zip');
    saveFile(blob, filename);
    await persist(store);
    const cancelled = signal.aborted || history?.stopReason === 'cancelled';
    const parts = [`ZIP descargado: ${filename}`, `${doc.messages.length} mensajes · ${bundle.files} archivos (${megabytes(blob.size)})`];
    if (bundle.missing > 0) parts.push(`${bundle.missing} archivos no se pudieron incluir (el motivo va en cada mensaje)`);
    if (history?.stopReason && history.stopReason !== 'cancelled') parts.push(stopMessage(history.stopReason).replace(/\.$/, ''));
    if (cancelled) parts.push('Cancelado: el ZIP contiene lo capturado hasta ese momento');
    finish(cancelled ? 'cancelled' : 'done', `${parts.join('. ')}.`);
  } catch (e) {
    finish('error', `No se pudo crear el ZIP: ${e instanceof Error ? e.message : 'error desconocido'}`);
  }
}

async function handle(req: ContentRequest): Promise<unknown> {
  switch (req.type) {
    case 'WAI_PING':
      return { ok: true, version: VERSION } satisfies PingResponse;

    case 'WAI_GET_STATE': {
      const chat = readChatInfo(document);
      const job = activeJob?.status ?? null;
      if (!chat) {
        return {
          ok: true, version: VERSION, chat: null, domCount: 0, storedCount: 0, oldest: null, newest: null,
          startReached: false, historyAttempted: false, job, tabHidden: document.hidden,
        } satisfies StateResponse;
      }
      const store = await getStore(chat);
      let domCount = countDomMessages(document);
      if (req.refresh && !activeJob) {
        try {
          domCount = ingestDom(store);
        } catch {
          // lectura no disponible en este instante: se informa con lo guardado
        }
      }
      return {
        ok: true,
        version: VERSION,
        chat: store.chat,
        domCount,
        storedCount: store.messages.length,
        oldest: store.oldestDate(),
        newest: store.newestDate(),
        startReached: store.startReached,
        historyAttempted: store.historyAttempted,
        job: job && job.chatKey === chat.key ? job : store.lastJob,
        tabHidden: document.hidden,
      } satisfies StateResponse;
    }

    case 'WAI_EXTRACT': {
      const chat = readChatInfo(document);
      if (!chat) return { ok: false, code: 'NO_CHAT', error: 'No hay ninguna conversación abierta en WhatsApp Web.' } satisfies ExtractResponse;
      const store = await getStore(chat);
      const storedBefore = store.messages.length;
      let domCount = 0;
      if (activeJob && activeJob.status.chatKey === chat.key) {
        domCount = countDomMessages(document);
      } else {
        try {
          domCount = ingestDom(store);
        } catch (e) {
          if (e instanceof Error && e.message === 'CHAT_MISMATCH') {
            return { ok: false, code: 'CHAT_CHANGED', error: 'El chat cambió durante la lectura. Vuelve a intentarlo.' } satisfies ExtractResponse;
          }
          throw e;
        }
        await persist(store);
      }
      return { ok: true, snapshot: store.toSnapshot(domCount, storedBefore, Date.now()) } satisfies ExtractResponse;
    }

    case 'WAI_HISTORY_START': {
      if (activeJob) return { ok: false, code: 'BUSY', error: 'Ya hay una recuperación en curso.' } satisfies SimpleResponse;
      const chat = readChatInfo(document);
      if (!chat) return { ok: false, code: 'NO_CHAT', error: 'No hay ninguna conversación abierta.' } satisfies SimpleResponse;
      const store = await getStore(chat);
      const controller = new AbortController();
      const jobId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const placeholder: JobStatus = {
        jobId, chatKey: chat.key, state: 'running', startedAt: Date.now(), updatedAt: Date.now(), batches: 0,
        captured: store.messages.length, newInLastBatch: 0, stopReason: null, message: 'Iniciando…', tabHidden: document.hidden,
      };
      activeJob = { status: placeholder, controller };
      const job = activeJob;
      void runHistory(
        {
          jobId,
          chatKey: chat.key,
          targetDate: req.targetDate,
          timeLimitMs: req.settings.historyTimeLimitMin * 60_000,
          messageLimit: req.settings.historyMessageLimit,
          scrollBackWhenDone: req.settings.scrollBackWhenDone,
          ...DEFAULT_HISTORY_OPTIONS,
        },
        {
          driver: createDomDriver(document, () => new Date()),
          store,
          now: Date.now,
          nowDate: () => new Date(),
          locale: locale(),
          sleep: abortableSleep,
          onProgress: (s) => {
            job.status = s;
          },
          saveCheckpoint: async () => persist(store),
        },
        controller.signal,
      ).finally(() => {
        if (activeJob === job) activeJob = null;
      });
      return { ok: true, job: placeholder } satisfies SimpleResponse;
    }

    case 'WAI_ZIP_START': {
      if (activeJob) return { ok: false, code: 'BUSY', error: 'Ya hay una recuperación en curso.' } satisfies SimpleResponse;
      const chat = readChatInfo(document);
      if (!chat) return { ok: false, code: 'NO_CHAT', error: 'No hay ninguna conversación abierta.' } satisfies SimpleResponse;
      const store = await getStore(chat);
      const placeholder: JobStatus = {
        jobId: newJobId(), chatKey: chat.key, state: 'running', startedAt: Date.now(), updatedAt: Date.now(), batches: 0,
        captured: store.messages.length, newInLastBatch: 0, stopReason: null, message: 'Preparando el ZIP…', tabHidden: document.hidden,
        kind: 'zip', media: { saved: 0, failed: 0, bytes: 0, images: 0, videos: 0, audios: 0, documents: 0 },
      };
      const job = { status: placeholder, controller: new AbortController() };
      activeJob = job;
      void runZipJob(req, store, job).finally(() => {
        if (activeJob === job) activeJob = null;
      });
      return { ok: true, job: placeholder } satisfies SimpleResponse;
    }

    case 'WAI_HISTORY_CANCEL': {
      if (!activeJob) return { ok: true, job: null } satisfies SimpleResponse;
      activeJob.controller.abort();
      return { ok: true, job: activeJob.status } satisfies SimpleResponse;
    }

    case 'WAI_CLEAR': {
      activeJob?.controller.abort();
      if (req.all) {
        stores.clear();
        restoreAttempted.clear();
        await background({ type: 'WAI_CP_CLEAR_ALL' });
      } else {
        const chat = readChatInfo(document);
        if (chat) {
          stores.delete(chat.key);
          restoreAttempted.add(chat.key);
          await background({ type: 'WAI_CP_DELETE', chatKey: chat.key });
        }
      }
      return { ok: true, job: null } satisfies SimpleResponse;
    }

    case 'WAI_DIAGNOSTICS':
      return { ok: true, diagnostics: { version: VERSION, ...collectDiagnostics(document) } } satisfies DiagnosticsResponse;
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Solo se aceptan órdenes de esta misma extensión (popup), nunca de la página.
  if (sender.id !== chrome.runtime.id || sender.tab) return false;
  if (!isContentRequest(message)) return false;
  handle(message)
    .then(sendResponse)
    .catch((e: unknown) => {
      debug('handler-error', { type: message.type });
      sendResponse({ ok: false, code: 'INTERNAL', error: e instanceof Error ? e.message : 'Error interno' });
    });
  return true;
});
