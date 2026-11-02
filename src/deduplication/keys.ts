import { hashString } from '../shared/hash';

const SEP = '\u241f';

export interface FingerprintInput {
  chatKey: string;
  direction: string;
  sender: string | null;
  date: string | null;
  time: string | null;
  kind: string;
  text: string;
  quoteText: string | null;
}

/** Huella del contenido (sin posición). Dos mensajes legítimos idénticos comparten base. */
export function fingerprintBase(input: FingerprintInput): string {
  return hashString(
    [input.chatKey, input.direction, input.sender ?? '', input.date ?? '', input.time ?? '', input.kind, input.text, input.quoteText ?? ''].join(SEP),
  );
}

/**
 * Clave completa de un mensaje sin id del DOM: base + nº de aparición de esa
 * misma base desde el ancla (mensaje con id más cercano). Así "Ok" enviado dos
 * veces seguidas produce dos claves distintas, y el mismo "Ok" visto en otra
 * pasada produce la misma clave.
 */
export function fingerprintKey(base: string, occurrence: number, anchor: string): string {
  return `fp:${base}:${occurrence}@${anchor}`;
}

export function domIdKey(domId: string): string {
  return `id:${domId}`;
}

export function parseFingerprintKey(key: string): { base: string; occurrence: number; anchor: string } | null {
  const m = /^fp:([a-z0-9]+):(\d+)@(.*)$/.exec(key);
  if (!m) return null;
  return { base: m[1]!, occurrence: Number(m[2]), anchor: m[3]! };
}
