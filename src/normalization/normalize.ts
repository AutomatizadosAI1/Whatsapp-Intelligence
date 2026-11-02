import type { ChatInfo, LocalDateTime, Message, RawMessage } from '../shared/types';
import {
  type DateOrderInference,
  type DateParts,
  inferDateOrder,
  parseDateParts,
  parseDayLabel,
  parsePrePlainText,
  parseTime,
  partsToIso,
} from './dates';
import { domIdKey, fingerprintBase, fingerprintKey } from '../deduplication/keys';

export interface NormalizeContext {
  chat: ChatInfo;
  now: Date;
  locale: string | null;
  /** Orden día/mes ya establecido para esta conversación (si existe). */
  knownOrder: DateOrderInference | null;
}

export interface NormalizeResult {
  messages: Message[];
  order: DateOrderInference;
}

function chooseOrder(samples: DateParts[], ctx: NormalizeContext): DateOrderInference {
  const fresh = inferDateOrder(samples, ctx.locale);
  if (!fresh.assumed) return fresh;
  if (ctx.knownOrder) return ctx.knownOrder;
  return fresh;
}

function isAmbiguous(parts: DateParts): boolean {
  return !parts.iso && parts.a <= 12 && parts.b <= 12 && parts.a !== parts.b;
}

/** RawMessage[] (orden del DOM) -> Message[] normalizados. Función pura. */
export function normalizeRaws(raws: RawMessage[], ctx: NormalizeContext): NormalizeResult {
  const pre = raws.map((r) => parsePrePlainText(r.prePlainText));
  const samples: DateParts[] = [];
  for (const p of pre) {
    const parts = parseDateParts(p?.dateText);
    if (parts) samples.push(parts);
  }
  for (const r of raws) {
    const parts = parseDateParts(r.dayLabel);
    if (parts) samples.push(parts);
  }
  const order = chooseOrder(samples, ctx);

  // Nombres de participantes aprendidos del propio chat (id del DOM -> nombre visible).
  const participantNames = new Map<string, string>();
  raws.forEach((r, i) => {
    const sender = pre[i]?.sender;
    if (r.participantJid && sender && r.direction === 'in') participantNames.set(r.participantJid, sender);
  });

  const messages: Message[] = raws.map((r, i) => {
    const p = pre[i] ?? null;
    let date: string | null = null;
    let rawDate: string | null = null;
    let assumed = false;
    let fromPrePlain = false;
    const preParts = parseDateParts(p?.dateText);
    if (preParts) {
      date = partsToIso(preParts, order.order);
      rawDate = p!.dateText;
      assumed = date !== null && order.assumed && isAmbiguous(preParts);
      fromPrePlain = date !== null;
    }
    if (!date && r.dayLabel) {
      const day = parseDayLabel(r.dayLabel, ctx.now, order.order);
      if (day?.date) {
        date = day.date;
        rawDate = r.dayLabel;
        const labelParts = parseDateParts(r.dayLabel);
        assumed = labelParts ? order.assumed && isAmbiguous(labelParts) : day.assumed;
      }
    }
    const time = p?.time ?? parseTime(r.timeText);
    let source: LocalDateTime['source'];
    if (date && time) source = fromPrePlain ? 'exact' : 'separator';
    else if (date) source = 'separator';
    else if (time) source = 'time-only';
    else source = 'none';

    let sender: string | null = null;
    let senderKnown = false;
    if (r.direction === 'out') {
      sender = p?.sender ?? null;
      senderKnown = true;
    } else if (r.direction === 'in') {
      sender =
        p?.sender ??
        r.senderLabel ??
        (r.participantJid ? participantNames.get(r.participantJid) ?? null : null) ??
        (!ctx.chat.isGroup ? ctx.chat.name : null);
      senderKnown = sender !== null;
    }

    return {
      key: r.domId ? domIdKey(r.domId) : '',
      idSource: r.domId ? 'dom-id' : 'fingerprint',
      chatKey: ctx.chat.key,
      direction: r.direction,
      sender,
      senderKnown,
      when: { date, time, source, dateAssumed: assumed, rawDate },
      kind: r.kind,
      text: r.text,
      quote: r.quote,
      mediaLabel: r.mediaLabel,
      edited: r.edited,
      forwarded: r.forwarded,
      truncated: r.truncated,
    } satisfies Message;
  });

  assignFingerprints(messages);
  return { messages, order };
}

/** Asigna claves por huella a los mensajes sin id, ancladas al id más cercano. */
export function assignFingerprints(messages: Message[]): void {
  let anchor: string | null = null;
  let counts = new Map<string, number>();
  const nextAnchor: Array<string | null> = new Array(messages.length).fill(null);
  let upcoming: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    nextAnchor[i] = upcoming;
    if (messages[i]!.idSource === 'dom-id') upcoming = messages[i]!.key;
  }
  messages.forEach((m, i) => {
    if (m.idSource === 'dom-id') {
      anchor = m.key;
      counts = new Map();
      return;
    }
    const base = fingerprintBase({
      chatKey: m.chatKey,
      direction: m.direction,
      sender: m.sender,
      date: m.when.date,
      time: m.when.time,
      kind: m.kind,
      text: m.text,
      quoteText: m.quote?.text ?? null,
    });
    const occ = counts.get(base) ?? 0;
    counts.set(base, occ + 1);
    const anchorRef = anchor ?? (nextAnchor[i] ? `n:${nextAnchor[i]}` : 'start');
    m.key = fingerprintKey(base, occ, anchorRef);
  });
}

/** Reinterpreta fechas que se dedujeron con un orden día/mes ya superado. */
export function reinterpretDates(messages: Message[], order: DateOrderInference): Message[] {
  return messages.map((m) => {
    if (!m.when.dateAssumed || !m.when.rawDate) return m;
    const parts = parseDateParts(m.when.rawDate);
    if (!parts) return m;
    const date = partsToIso(parts, order.order);
    return { ...m, when: { ...m.when, date, dateAssumed: order.assumed && isAmbiguous(parts) } };
  });
}
