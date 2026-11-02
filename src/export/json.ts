import type { ExportDocument } from './document';
import { senderLabel } from './format';
import { firstLastLabel } from './format';

export const JSON_SCHEMA_ID = 'automatizadosai/whatsapp-intelligence/conversation';
export const JSON_SCHEMA_VERSION = '1.0.0';

export interface ConversationJson {
  schema: typeof JSON_SCHEMA_ID;
  schemaVersion: typeof JSON_SCHEMA_VERSION;
  generator: { name: string; version: string };
  exportedAt: string;
  chat: { name: string; isGroup: boolean };
  coverage: { code: string; label: string };
  range: { mode: string; from: string | null; to: string | null; firstLast: string };
  totals: { captured: number; exported: number; excludedUndated: number };
  participants: Array<{ label: string; direction: 'in' | 'out'; messages: number }>;
  warnings: string[];
  messages: Array<{
    index: number;
    key: string;
    idSource: string;
    direction: string;
    sender: string | null;
    senderLabel: string;
    senderKnown: boolean;
    date: string | null;
    time: string | null;
    timestampSource: string;
    dateAssumed: boolean;
    originalDateText: string | null;
    type: string;
    text: string;
    quote: { sender: string | null; text: string } | null;
    media: { label: string | null; transcription: string | null; file?: string | null; missing?: string | null } | null;
    edited: boolean;
    forwarded: boolean;
    truncated: boolean;
  }>;
}

function offsetIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const MEDIA_KINDS = new Set(['audio', 'voice', 'image', 'video', 'gif', 'sticker', 'document', 'location', 'contact', 'poll']);

export function buildJson(doc: ExportDocument, version: string): ConversationJson {
  const participants = new Map<string, { label: string; direction: 'in' | 'out'; messages: number }>();
  for (const m of doc.messages) {
    if (m.direction === 'system') continue;
    const label = senderLabel(m, doc.chat, doc.senderLabels);
    const key = `${m.direction}:${label}`;
    const entry = participants.get(key) ?? { label, direction: m.direction, messages: 0 };
    entry.messages++;
    participants.set(key, entry);
  }
  return {
    schema: JSON_SCHEMA_ID,
    schemaVersion: JSON_SCHEMA_VERSION,
    generator: { name: 'WhatsApp Intelligence', version },
    exportedAt: offsetIso(doc.exportedAt),
    chat: { name: doc.chat.name, isGroup: doc.chat.isGroup },
    coverage: { code: doc.coverage, label: doc.coverageText },
    range: { mode: doc.range.mode, from: doc.bounds.from, to: doc.bounds.to, firstLast: firstLastLabel(doc.messages) },
    totals: doc.totals,
    participants: [...participants.values()],
    warnings: doc.warnings,
    messages: doc.messages.map((m, index) => ({
      index,
      key: m.key,
      idSource: m.idSource,
      direction: m.direction,
      sender: m.sender,
      senderLabel: senderLabel(m, doc.chat, doc.senderLabels),
      senderKnown: m.senderKnown,
      date: m.when.date,
      time: m.when.time,
      timestampSource: m.when.source,
      dateAssumed: m.when.dateAssumed,
      originalDateText: m.when.rawDate,
      type: m.kind,
      text: m.text,
      quote: m.quote,
      media: MEDIA_KINDS.has(m.kind)
        ? {
            label: m.mediaLabel,
            transcription: doc.transcriptions.get(m.key) ?? null,
            ...(m.mediaFile !== undefined || m.mediaMissing !== undefined ? { file: m.mediaFile ?? null, missing: m.mediaMissing ?? null } : {}),
          }
        : null,
      edited: m.edited,
      forwarded: m.forwarded,
      truncated: m.truncated,
    })),
  };
}

export function formatJson(doc: ExportDocument, version: string): string {
  return `${JSON.stringify(buildJson(doc, version), null, 2)}\n`;
}
