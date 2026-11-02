import type { Message, RangeSelection } from '../shared/types';
import { addDays, localIsoDate } from '../normalization/dates';

export interface RangeBounds {
  from: string | null;
  to: string | null;
}

export function rangeBounds(range: RangeSelection, now: Date): RangeBounds {
  const today = localIsoDate(now);
  switch (range.mode) {
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'custom': {
      let from = range.from || null;
      let to = range.to || null;
      if (from && to && from > to) [from, to] = [to, from];
      return { from, to };
    }
    default:
      return { from: null, to: null };
  }
}

export interface RangeResult {
  messages: Message[];
  bounds: RangeBounds;
  excludedUndated: number;
  /** Hay evidencia de que el rango está completo (se capturó algo anterior al inicio). */
  coveredByEvidence: boolean;
}

/**
 * Filtra por rango. Un mensaje sin fecha se incluye solo si sus vecinos con
 * fecha caen dentro del rango; si no, se excluye y se cuenta (nunca se le
 * asigna una fecha).
 */
export function applyRange(messages: Message[], range: RangeSelection, now: Date, startReached: boolean): RangeResult {
  const bounds = rangeBounds(range, now);
  if (!bounds.from && !bounds.to) {
    return { messages, bounds, excludedUndated: 0, coveredByEvidence: startReached };
  }
  const today = localIsoDate(now);
  const inRange = (d: string) => (!bounds.from || d >= bounds.from) && (!bounds.to || d <= bounds.to);
  const prevDate: Array<string | null> = [];
  let last: string | null = null;
  for (const m of messages) {
    prevDate.push(last);
    if (m.when.date) last = m.when.date;
  }
  const nextDate: Array<string | null> = new Array(messages.length).fill(null);
  let upcoming: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    nextDate[i] = upcoming;
    if (messages[i]!.when.date) upcoming = messages[i]!.when.date;
  }

  let excludedUndated = 0;
  const kept: Message[] = [];
  messages.forEach((m, i) => {
    if (m.when.date) {
      if (inRange(m.when.date)) kept.push(m);
      return;
    }
    const prev = prevDate[i];
    const next = nextDate[i];
    const prevOk = prev ? inRange(prev) : bounds.from === null;
    const nextOk = next ? inRange(next) : bounds.to === null || bounds.to >= today;
    if ((prev || next) && prevOk && nextOk) kept.push(m);
    else if (m.direction !== 'system') excludedUndated++;
  });
  const coveredByEvidence =
    startReached || (bounds.from !== null && messages.some((m) => m.when.date !== null && m.when.date < bounds.from!));
  return { messages: kept, bounds, excludedUndated, coveredByEvidence };
}
