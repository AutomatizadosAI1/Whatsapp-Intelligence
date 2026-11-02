/** Modelos de dominio compartidos entre content script, service worker y popup. */

export type Direction = 'in' | 'out' | 'system';

export type MessageKind =
  | 'text'
  | 'audio'
  | 'voice'
  | 'image'
  | 'video'
  | 'gif'
  | 'sticker'
  | 'document'
  | 'location'
  | 'contact'
  | 'poll'
  | 'call'
  | 'deleted'
  | 'system'
  | 'unknown';

/**
 * Procedencia del timestamp:
 * - exact: fecha y hora leídas del atributo de copia del propio mensaje.
 * - separator: fecha del separador de día visible + hora del propio mensaje.
 * - time-only: solo hay hora; la fecha no está disponible.
 * - none: no hay ni fecha ni hora.
 */
export type TimestampSource = 'exact' | 'separator' | 'time-only' | 'none';

/** Mensaje tal y como se lee del DOM, sin normalizar. */
export interface RawMessage {
  domId: string | null;
  chatJid: string | null;
  participantJid: string | null;
  direction: Direction;
  prePlainText: string | null;
  senderLabel: string | null;
  timeText: string | null;
  dayLabel: string | null;
  kind: MessageKind;
  text: string;
  quote: { sender: string | null; text: string } | null;
  mediaLabel: string | null;
  edited: boolean;
  forwarded: boolean;
  truncated: boolean;
  /** Posición dentro de la instantánea del DOM (0 = más antiguo presente). */
  domIndex: number;
}

export interface LocalDateTime {
  /** AAAA-MM-DD, o null si la fecha no está disponible. */
  date: string | null;
  /** HH:MM en 24 h, o null. */
  time: string | null;
  source: TimestampSource;
  /** True si algún componente de la fecha (orden día/mes o año) se dedujo y no se leyó. */
  dateAssumed: boolean;
  /** Texto de fecha original tal y como lo mostraba WhatsApp (para reinterpretarlo). */
  rawDate: string | null;
}

export interface Message {
  /** Clave de deduplicación: id del DOM o huella compuesta. */
  key: string;
  idSource: 'dom-id' | 'fingerprint';
  chatKey: string;
  direction: Direction;
  sender: string | null;
  senderKnown: boolean;
  when: LocalDateTime;
  kind: MessageKind;
  text: string;
  quote: { sender: string | null; text: string } | null;
  mediaLabel: string | null;
  edited: boolean;
  forwarded: boolean;
  truncated: boolean;
  /** Solo en la exportación ZIP: ruta del archivo adjunto dentro del ZIP. */
  mediaFile?: string | null;
  /** Solo en la exportación ZIP: por qué no se incluyó el archivo de este mensaje. */
  mediaMissing?: string | null;
}

export interface ChatInfo {
  /** Identidad estable del chat (JID visible en el DOM o, en su defecto, el título). */
  key: string;
  keySource: 'jid' | 'title';
  name: string;
  isGroup: boolean;
}

export type Coverage = 'loaded-only' | 'partial' | 'start-reached';

export type JobState = 'idle' | 'running' | 'done' | 'cancelled' | 'error' | 'interrupted';

export type JobStopReason =
  | 'start-reached'
  | 'target-date-reached'
  | 'no-progress'
  | 'phone-sync-required'
  | 'time-limit'
  | 'message-limit'
  | 'cancelled'
  | 'chat-changed'
  | 'container-not-found'
  | 'error';

export interface JobStatus {
  jobId: string;
  chatKey: string;
  state: JobState;
  startedAt: number;
  updatedAt: number;
  batches: number;
  captured: number;
  newInLastBatch: number;
  stopReason: JobStopReason | null;
  message: string;
  tabHidden: boolean;
  /** "zip": recuperación con descarga de fotos, audios y vídeos. */
  kind?: 'history' | 'zip';
  media?: JobMediaStats;
}

export interface JobMediaStats {
  saved: number;
  failed: number;
  bytes: number;
  images: number;
  videos: number;
  audios: number;
  documents?: number;
}

export interface Checkpoint {
  version: 1;
  chatKey: string;
  chatName: string;
  isGroup: boolean;
  savedAt: number;
  messages: Message[];
  startReached: boolean;
  historyAttempted: boolean;
  gapSuspected: boolean;
  job: JobStatus | null;
}

export interface ConversationSnapshot {
  chat: ChatInfo;
  messages: Message[];
  coverage: Coverage;
  startReached: boolean;
  historyAttempted: boolean;
  gapSuspected: boolean;
  warnings: string[];
  domCount: number;
  storedCount: number;
  extractedAt: number;
}

export type RangeMode = 'loaded' | 'last7' | 'last30' | 'custom' | 'all';

export interface RangeSelection {
  mode: RangeMode;
  /** AAAA-MM-DD inclusivo (solo custom). */
  from?: string;
  to?: string;
}

export type SenderLabelMode = 'roles' | 'names';

export interface Settings {
  senderLabels: SenderLabelMode;
  includeSystem: boolean;
  scrollBackWhenDone: boolean;
  historyTimeLimitMin: number;
  historyMessageLimit: number;
  checkpointTtlHours: number;
}

export const DEFAULT_SETTINGS: Settings = {
  senderLabels: 'roles',
  includeSystem: true,
  scrollBackWhenDone: true,
  historyTimeLimitMin: 10,
  historyMessageLimit: 20000,
  checkpointTtlHours: 12,
};
