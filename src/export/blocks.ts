/**
 * Partición de textos grandes en bloques numerados para copiar por partes si
 * el portapapeles falla. Corta por límites de mensaje; un mensaje más largo
 * que el bloque se divide con marca de continuación. Nunca se pierde texto.
 */

export interface TextBlock {
  index: number;
  total: number;
  text: string;
  /** Rango 1-based de unidades (mensajes) incluidas. */
  firstUnit: number;
  lastUnit: number;
}

export const CONTINUES = '[… continúa en la parte siguiente]';

export function splitIntoBlocks(header: string, units: string[], maxChars: number, title: string): TextBlock[] {
  const limit = Math.max(1000, maxChars);
  const raw: Array<{ parts: string[]; first: number; last: number }> = [];
  let current: { parts: string[]; size: number; first: number; last: number } = { parts: [header], size: header.length, first: 1, last: 0 };
  const flush = () => {
    if (current.parts.length > 0) raw.push({ parts: current.parts, first: current.first, last: current.last });
  };

  units.forEach((unit, i) => {
    const n = i + 1;
    const cost = unit.length + 2;
    if (current.size + cost <= limit) {
      current.parts.push(unit);
      current.size += cost;
      current.last = n;
      return;
    }
    if (unit.length + 2 <= limit) {
      flush();
      current = { parts: [unit], size: cost, first: n, last: n };
      return;
    }
    // Mensaje enorme: se trocea en fragmentos.
    flush();
    let rest = unit;
    while (rest.length > 0) {
      const chunk = rest.slice(0, limit - CONTINUES.length - 4);
      rest = rest.slice(chunk.length);
      raw.push({ parts: [rest.length > 0 ? `${chunk}\n${CONTINUES}` : chunk], first: n, last: n });
    }
    current = { parts: [], size: 0, first: n + 1, last: n };
  });
  flush();

  const blocks = raw.filter((b) => b.parts.length > 0);
  const total = blocks.length;
  return blocks.map((b, i) => ({
    index: i + 1,
    total,
    firstUnit: b.first,
    lastUnit: b.last,
    text: `=== PARTE ${i + 1}/${total} · ${title} · mensajes ${b.first}-${Math.max(b.first, b.last)} de ${units.length} ===\n\n${b.parts.join('\n\n')}\n\n=== FIN PARTE ${i + 1}/${total} ===\n`,
  }));
}
