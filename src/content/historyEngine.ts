/**
 * Recuperación progresiva del historial: desplaza el contenedor hacia arriba,
 * espera a que WhatsApp cargue, captura cada lote y lo fusiona. Se detiene con
 * un motivo explícito; nunca declara el historial completo sin evidencia.
 */
import type { JobStatus, JobStopReason } from '../shared/types';
import type { DomSnapshot } from '../adapters/whatsapp/dom';
import type { ConversationStore } from './conversationStore';

export interface HistoryDriver {
  currentChatKey(): string | null;
  capture(): DomSnapshot;
  /** Desplaza hacia los mensajes antiguos. False si no hay contenedor. */
  scrollOlder(): boolean;
  scrollToNewest(): void;
  isHidden(): boolean;
  scrollHeight(): number;
  /** Resuelve true si el DOM de la conversación cambia antes del timeout. */
  waitForChange(timeoutMs: number, signal: AbortSignal): Promise<boolean>;
}

export interface HistoryOptions {
  jobId: string;
  chatKey: string;
  /** AAAA-MM-DD: parar cuando lo capturado sea anterior a esta fecha. */
  targetDate: string | null;
  timeLimitMs: number;
  messageLimit: number;
  maxNoProgress: number;
  baseWaitMs: number;
  maxWaitMs: number;
  settleMs: number;
  checkpointEvery: number;
  scrollBackWhenDone: boolean;
}

export const DEFAULT_HISTORY_OPTIONS = {
  maxNoProgress: 6,
  baseWaitMs: 700,
  maxWaitMs: 5000,
  settleMs: 250,
  checkpointEvery: 3,
};

export interface HistoryDeps {
  driver: HistoryDriver;
  store: ConversationStore;
  now(): number;
  nowDate(): Date;
  locale: string | null;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  onProgress(status: JobStatus): void;
  saveCheckpoint(status: JobStatus): Promise<void>;
  /** Se llama tras cada lectura del DOM (p. ej. para descargar la multimedia visible). */
  afterCapture?(signal: AbortSignal): Promise<void>;
}

const STOP_MESSAGES: Record<JobStopReason, string> = {
  'start-reached': 'Inicio aparente del chat alcanzado (aviso de cifrado visible al principio).',
  'target-date-reached': 'Se capturaron mensajes anteriores al inicio del rango solicitado.',
  'no-progress': 'WhatsApp no cargó más mensajes tras varios intentos. No hay evidencia de haber llegado al inicio del chat.',
  'phone-sync-required':
    'WhatsApp Web no carga más: los mensajes anteriores solo están en el teléfono. Se ha recuperado todo lo que WhatsApp Web tiene en este equipo.',
  'time-limit': 'Se alcanzó el límite de tiempo. Puedes continuar con otra recuperación.',
  'message-limit': 'Se alcanzó el límite de mensajes configurado.',
  cancelled: 'Cancelado. Se conserva todo lo capturado.',
  'chat-changed': 'Se cambió de chat durante la recuperación; se detuvo para no mezclar conversaciones. Lo capturado se conserva.',
  'container-not-found': 'No se encontró el contenedor de mensajes de la conversación.',
  error: 'Error inesperado durante la recuperación. Lo capturado se conserva.',
};

export function stopMessage(reason: JobStopReason): string {
  return STOP_MESSAGES[reason];
}

function stateFor(reason: JobStopReason): JobStatus['state'] {
  if (reason === 'cancelled') return 'cancelled';
  if (reason === 'chat-changed' || reason === 'container-not-found' || reason === 'error') return 'error';
  return 'done';
}

export async function runHistory(opts: HistoryOptions, deps: HistoryDeps, signal: AbortSignal): Promise<JobStatus> {
  const { driver, store } = deps;
  const startedAt = deps.now();
  const status: JobStatus = {
    jobId: opts.jobId,
    chatKey: opts.chatKey,
    state: 'running',
    startedAt,
    updatedAt: startedAt,
    batches: 0,
    captured: store.messages.length,
    newInLastBatch: 0,
    stopReason: null,
    message: 'Recuperando historial…',
    tabHidden: driver.isHidden(),
  };
  store.historyAttempted = true;
  store.lastJob = status;

  const publish = () => {
    status.updatedAt = deps.now();
    status.captured = store.messages.length;
    status.tabHidden = driver.isHidden();
    deps.onProgress({ ...status });
  };

  let stop: JobStopReason | null = null;
  let noProgress = 0;
  let wait = opts.baseWaitMs;

  try {
    if (driver.currentChatKey() !== opts.chatKey) {
      stop = 'chat-changed';
    } else {
      let snap = driver.capture();
      store.ingest(snap, deps.nowDate(), deps.locale, 'newer');
      let lastTop = snap.topKey;
      let lastHeight = driver.scrollHeight();
      publish();
      if (deps.afterCapture) await deps.afterCapture(signal);

      while (!stop) {
        if (signal.aborted) { stop = 'cancelled'; break; }
        if (store.startReached) { stop = 'start-reached'; break; }
        const oldest = store.oldestDate();
        if (opts.targetDate && oldest && oldest < opts.targetDate) { stop = 'target-date-reached'; break; }
        if (deps.now() - startedAt > opts.timeLimitMs) { stop = 'time-limit'; break; }
        if (store.messages.length >= opts.messageLimit) { stop = 'message-limit'; break; }

        if (!driver.scrollOlder()) { stop = 'container-not-found'; break; }
        await driver.waitForChange(wait, signal);
        if (signal.aborted) { stop = 'cancelled'; break; }
        await deps.sleep(opts.settleMs, signal);
        if (signal.aborted) { stop = 'cancelled'; break; }

        if (driver.currentChatKey() !== opts.chatKey) { stop = 'chat-changed'; break; }
        snap = driver.capture();
        if (!snap.chat || snap.chat.key !== opts.chatKey) { stop = 'chat-changed'; break; }
        const added = store.ingest(snap, deps.nowDate(), deps.locale, 'older');
        const height = driver.scrollHeight();
        const progressed = added > 0 || snap.topKey !== lastTop || height > lastHeight;
        lastTop = snap.topKey;
        lastHeight = Math.max(lastHeight, height);
        status.batches++;
        status.newInLastBatch = added;

        if (progressed) {
          noProgress = 0;
          wait = opts.baseWaitMs;
        } else if (!snap.loading) {
          noProgress++;
          wait = Math.min(opts.maxWaitMs, Math.round(wait * 1.6));
        }
        status.message = `Lote ${status.batches}: ${added} mensajes nuevos${snap.loading ? ' (WhatsApp está cargando…)' : ''}`;
        publish();
        if (deps.afterCapture) {
          await deps.afterCapture(signal);
          if (signal.aborted) { stop = 'cancelled'; break; }
        }

        if (snap.startMarker) { stop = 'start-reached'; break; }
        if (noProgress >= opts.maxNoProgress) {
          stop = snap.phoneSync || store.phoneSyncSeen ? 'phone-sync-required' : 'no-progress';
          break;
        }
        if (status.batches % opts.checkpointEvery === 0) await deps.saveCheckpoint({ ...status });
      }
    }
  } catch (e) {
    stop = signal.aborted ? 'cancelled' : e instanceof Error && e.message === 'CHAT_MISMATCH' ? 'chat-changed' : 'error';
  }

  const reason = stop ?? 'error';
  status.stopReason = reason;
  status.state = stateFor(reason);
  status.message = stopMessage(reason);
  status.updatedAt = deps.now();
  status.captured = store.messages.length;
  store.lastJob = { ...status };
  if (opts.scrollBackWhenDone && reason !== 'chat-changed') {
    try {
      driver.scrollToNewest();
    } catch {
      // sin contenedor: nada que restaurar
    }
  }
  try {
    await deps.saveCheckpoint({ ...status });
  } catch {
    // el error de guardado queda reflejado en store.checkpointError
  }
  deps.onProgress({ ...status });
  return { ...status };
}
