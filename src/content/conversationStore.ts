import type { ChatInfo, Checkpoint, ConversationSnapshot, Coverage, JobStatus, Message } from '../shared/types';
import type { DomSnapshot } from '../adapters/whatsapp/dom';
import type { DateOrderInference } from '../normalization/dates';
import { normalizeRaws, reinterpretDates } from '../normalization/normalize';
import { mergeMessages, type MergeDirection } from '../deduplication/merge';

/**
 * Conversación acumulada de un único chat. Toda operación comprueba que los
 * datos pertenecen a este chat: nunca se mezclan dos conversaciones.
 */
export class ConversationStore {
  messages: Message[] = [];
  startReached = false;
  historyAttempted = false;
  gapSuspected = false;
  order: DateOrderInference | null = null;
  foreignDropped = 0;
  phoneSyncSeen = false;
  phoneSyncNotice: string | null = null;
  checkpointError: string | null = null;
  lastJob: JobStatus | null = null;

  constructor(public chat: ChatInfo) {}

  /** Incorpora una lectura del DOM. Devuelve cuántos mensajes nuevos se añadieron. */
  ingest(dom: DomSnapshot, now: Date, locale: string | null, direction: MergeDirection): number {
    if (!dom.chat || dom.chat.key !== this.chat.key) {
      throw new Error('CHAT_MISMATCH');
    }
    if (dom.chat.name && dom.chat.name !== this.chat.name) this.chat = { ...this.chat, name: dom.chat.name };
    const { messages, order } = normalizeRaws(dom.raws, { chat: this.chat, now, locale, knownOrder: this.order });
    if (this.order && this.order.assumed && !order.assumed && this.order.order !== order.order) {
      // Se confirmó un orden día/mes distinto del supuesto: se corrigen las fechas guardadas.
      this.messages = reinterpretDates(this.messages, order);
    }
    this.order = order;
    const result = mergeMessages(this.messages, messages, direction);
    this.messages = result.messages;
    if (result.disjoint) this.gapSuspected = true;
    if (dom.startMarker) this.startReached = true;
    if (dom.phoneSync) this.phoneSyncSeen = true;
    if (dom.phoneSyncNotice) this.phoneSyncNotice = dom.phoneSyncNotice;
    this.foreignDropped = Math.max(this.foreignDropped, dom.foreignDropped);
    return result.added;
  }

  restore(cp: Checkpoint): void {
    if (cp.chatKey !== this.chat.key) throw new Error('CHAT_MISMATCH');
    this.messages = cp.messages.filter((m) => m.chatKey === this.chat.key);
    this.startReached = cp.startReached;
    this.historyAttempted = cp.historyAttempted;
    this.gapSuspected = cp.gapSuspected;
    if (cp.job) {
      this.lastJob =
        cp.job.state === 'running'
          ? {
              ...cp.job,
              state: 'interrupted',
              message: 'La recuperación anterior se interrumpió (recarga o cierre de la pestaña). Puedes reanudarla.',
            }
          : cp.job;
    }
  }

  toCheckpoint(now: number): Checkpoint {
    return {
      version: 1,
      chatKey: this.chat.key,
      chatName: this.chat.name,
      isGroup: this.chat.isGroup,
      savedAt: now,
      messages: this.messages,
      startReached: this.startReached,
      historyAttempted: this.historyAttempted,
      gapSuspected: this.gapSuspected,
      job: this.lastJob,
    };
  }

  coverage(): Coverage {
    if (this.startReached) return 'start-reached';
    if (this.historyAttempted) return 'partial';
    return 'loaded-only';
  }

  oldestDate(): string | null {
    for (const m of this.messages) if (m.when.date) return m.when.date;
    return null;
  }

  newestDate(): string | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const d = this.messages[i]!.when.date;
      if (d) return d;
    }
    return null;
  }

  warnings(): string[] {
    const w: string[] = [];
    if (this.chat.keySource === 'title') {
      w.push('No se pudo leer el identificador interno del chat en pantalla; la conversación se identifica por su nombre visible.');
    }
    if (this.gapSuspected) {
      w.push('Posible hueco entre lotes: una lectura no enlazaba con lo ya capturado. Repite RECUPERAR HISTORIAL para cubrirlo.');
    }
    if (this.foreignDropped > 0) {
      w.push(`Se descartaron ${this.foreignDropped} elementos de otro chat para no mezclar conversaciones.`);
    }
    if (this.phoneSyncSeen && !this.startReached) {
      w.push(
        this.phoneSyncNotice
          ? `Aviso de WhatsApp: «${this.phoneSyncNotice}» Los mensajes anteriores a esa fecha no están en WhatsApp Web.`
          : 'WhatsApp indica que hay mensajes anteriores que solo están en el teléfono.',
      );
    }
    if (this.checkpointError) w.push(`No se pudo guardar la copia temporal: ${this.checkpointError}`);
    return w;
  }

  toSnapshot(domCount: number, storedBefore: number, now: number): ConversationSnapshot {
    return {
      chat: this.chat,
      messages: this.messages,
      coverage: this.coverage(),
      startReached: this.startReached,
      historyAttempted: this.historyAttempted,
      gapSuspected: this.gapSuspected,
      warnings: this.warnings(),
      domCount,
      storedCount: storedBefore,
      extractedAt: now,
    };
  }
}
