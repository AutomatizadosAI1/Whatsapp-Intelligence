import type { Message } from '../shared/types';
import { parseFingerprintKey } from './keys';

export type MergeDirection = 'older' | 'newer';

export interface MergeResult {
  messages: Message[];
  added: number;
  updated: number;
  /** True si el lote no comparte ningún mensaje con lo ya guardado (posible hueco). */
  disjoint: boolean;
}

/** Combina dos lecturas del mismo mensaje quedándose con la información más completa. */
export function preferRicher(a: Message, b: Message): Message {
  const rank = { exact: 3, separator: 2, 'time-only': 1, none: 0 } as const;
  const when = rank[b.when.source] > rank[a.when.source] ||
    (rank[b.when.source] === rank[a.when.source] && a.when.dateAssumed && !b.when.dateAssumed)
    ? b.when
    : a.when;
  const textFromB = (a.truncated && !b.truncated) || (b.text.length > a.text.length && a.truncated === b.truncated);
  return {
    ...a,
    when,
    sender: a.sender ?? b.sender,
    senderKnown: a.senderKnown || b.senderKnown,
    text: textFromB ? b.text : a.text,
    truncated: textFromB ? b.truncated : a.truncated,
    quote: a.quote ?? b.quote,
    mediaLabel: a.mediaLabel ?? b.mediaLabel,
    kind: a.kind === 'unknown' ? b.kind : b.kind === 'deleted' ? 'deleted' : a.kind,
    edited: a.edited || b.edited,
    forwarded: a.forwarded || b.forwarded,
  };
}

/**
 * Fusiona un lote ordenado (orden del DOM) en el almacén ordenado.
 * - Los mensajes ya conocidos sirven de anclas; los nuevos se insertan junto a ellas.
 * - Los mensajes con huella (sin id) se emparejan también por contenido cerca de
 *   su posición esperada, para no duplicarlos si su ancla ha cambiado.
 * - Nunca elimina mensajes: dos textos idénticos con claves distintas se conservan.
 */
export function mergeMessages(store: Message[], batch: Message[], direction: MergeDirection): MergeResult {
  const index = new Map<string, number>();
  store.forEach((m, i) => index.set(m.key, i));

  // Fase 1: emparejamiento exacto por clave.
  const resolved: number[] = batch.map((m) => index.get(m.key) ?? -1);
  const used = new Set(resolved.filter((i) => i >= 0));

  // Fase 2: emparejamiento por huella entre anclas vecinas.
  for (let i = 0; i < batch.length; i++) {
    if (resolved[i]! >= 0) continue;
    const fp = parseFingerprintKey(batch[i]!.key);
    if (!fp) continue;
    let prev = -1;
    for (let j = i - 1; j >= 0; j--) if (resolved[j]! >= 0) { prev = resolved[j]!; break; }
    let next = -1;
    for (let j = i + 1; j < batch.length; j++) if (resolved[j]! >= 0) { next = resolved[j]!; break; }
    const lo = prev >= 0 ? prev + 1 : Math.max(0, (next >= 0 ? next : store.length) - 12);
    const hi = next >= 0 ? next - 1 : Math.min(store.length - 1, (prev >= 0 ? prev : -1) + 12);
    for (let s = lo; s <= hi; s++) {
      if (used.has(s)) continue;
      const other = parseFingerprintKey(store[s]!.key);
      if (other && other.base === fp.base && other.occurrence === fp.occurrence) {
        resolved[i] = s;
        used.add(s);
        break;
      }
    }
  }

  const anyResolved = resolved.some((r) => r >= 0);
  let updated = 0;
  const output = store.slice();
  for (let i = 0; i < batch.length; i++) {
    const r = resolved[i]!;
    if (r >= 0) {
      const merged = preferRicher(output[r]!, batch[i]!);
      if (merged !== output[r]) updated++;
      output[r] = merged;
    }
  }

  if (!anyResolved) {
    const fresh = dedupeWithin(batch);
    return {
      messages: direction === 'older' ? [...fresh, ...output] : [...output, ...fresh],
      added: fresh.length,
      updated: 0,
      disjoint: store.length > 0 && fresh.length > 0,
    };
  }

  // Fase 3: insertar los nuevos tras su ancla anterior (o antes de la siguiente).
  const insertAfter = new Map<number, Message[]>();
  let lastAnchor = -1;
  let firstAnchor = -1;
  for (let i = 0; i < batch.length; i++) if (resolved[i]! >= 0) { firstAnchor = resolved[i]!; break; }
  const seenNew = new Set<string>();
  let added = 0;
  for (let i = 0; i < batch.length; i++) {
    const r = resolved[i]!;
    if (r >= 0) {
      lastAnchor = Math.max(lastAnchor, r);
      continue;
    }
    const m = batch[i]!;
    if (seenNew.has(m.key)) continue;
    seenNew.add(m.key);
    const slot = lastAnchor >= 0 ? lastAnchor : firstAnchor - 1;
    const list = insertAfter.get(slot) ?? [];
    list.push(m);
    insertAfter.set(slot, list);
    added++;
  }
  const result: Message[] = [...(insertAfter.get(-1) ?? [])];
  for (let s = 0; s < output.length; s++) {
    result.push(output[s]!);
    const extra = insertAfter.get(s);
    if (extra) result.push(...extra);
  }
  return { messages: result, added, updated, disjoint: false };
}

function dedupeWithin(batch: Message[]): Message[] {
  const seen = new Set<string>();
  return batch.filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));
}

/** Cuenta inversiones cronológicas entre timestamps exactos consecutivos. */
export function chronologyInversions(messages: Message[]): number {
  let last: string | null = null;
  let inversions = 0;
  for (const m of messages) {
    if (m.when.source !== 'exact' || !m.when.date || !m.when.time) continue;
    const stamp = `${m.when.date}T${m.when.time}`;
    if (last && stamp < last) inversions++;
    last = stamp;
  }
  return inversions;
}
