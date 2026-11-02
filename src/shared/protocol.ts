import type { ChatInfo, Checkpoint, ConversationSnapshot, JobStatus, RangeSelection, Settings } from './types';

/** Mensajes popup -> content script. */
export type ContentRequest =
  | { type: 'WAI_PING' }
  | { type: 'WAI_GET_STATE'; refresh: boolean }
  | { type: 'WAI_EXTRACT' }
  | { type: 'WAI_HISTORY_START'; range: RangeSelection; targetDate: string | null; settings: Settings }
  | { type: 'WAI_ZIP_START'; range: RangeSelection; targetDate: string | null; settings: Settings }
  | { type: 'WAI_HISTORY_CANCEL' }
  | { type: 'WAI_CLEAR'; all: boolean }
  | { type: 'WAI_DIAGNOSTICS' };

export interface ErrorResponse {
  ok: false;
  code: 'NO_CHAT' | 'CHAT_CHANGED' | 'BUSY' | 'INTERNAL' | 'NO_CONTAINER';
  error: string;
}

export interface StateResponse {
  ok: true;
  version: string;
  chat: ChatInfo | null;
  domCount: number;
  storedCount: number;
  oldest: string | null;
  newest: string | null;
  startReached: boolean;
  historyAttempted: boolean;
  job: JobStatus | null;
  tabHidden: boolean;
}

export type ExtractResponse = { ok: true; snapshot: ConversationSnapshot } | ErrorResponse;
export type SimpleResponse = { ok: true; job: JobStatus | null } | ErrorResponse;
export type DiagnosticsResponse = { ok: true; diagnostics: Record<string, unknown> } | ErrorResponse;
export type PingResponse = { ok: true; version: string };

/** Mensajes content script / popup -> service worker (almacenamiento temporal). */
export type BackgroundRequest =
  | { type: 'WAI_CP_SAVE'; checkpoint: Checkpoint }
  | { type: 'WAI_CP_LOAD'; chatKey: string }
  | { type: 'WAI_CP_DELETE'; chatKey: string }
  | { type: 'WAI_CP_CLEAR_ALL' }
  | { type: 'WAI_CP_STATS' };

export type BackgroundResponse =
  | { ok: true; checkpoint?: Checkpoint | null; count?: number; bytes?: number }
  | { ok: false; error: string };

function typeOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const t = (value as { type?: unknown }).type;
  return typeof t === 'string' ? t : null;
}

export function isContentRequest(value: unknown): value is ContentRequest {
  const t = typeOf(value);
  return t !== null && t.startsWith('WAI_') && !t.startsWith('WAI_CP_');
}

export function isBackgroundRequest(value: unknown): value is BackgroundRequest {
  const t = typeOf(value);
  return t !== null && t.startsWith('WAI_CP_');
}
