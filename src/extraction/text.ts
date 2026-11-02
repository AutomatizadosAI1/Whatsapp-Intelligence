/**
 * Extracción de texto visible de un nodo del DOM sin usar innerHTML.
 * Conserva emojis (img alt), saltos de línea (<br> y bloques) y el texto
 * visible de los enlaces; omite botones, SVG y elementos ocultos.
 */

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'BUTTON', 'NOSCRIPT', 'TEMPLATE', 'INPUT', 'TEXTAREA', 'SELECT']);
const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR']);

export interface ExtractOptions {
  /** Subárboles a excluir (p. ej. el mensaje citado dentro del cuerpo). */
  exclude?: (el: Element) => boolean;
}

function isHidden(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true' && el.tagName !== 'IMG') return true;
  if (el.hasAttribute('hidden')) return true;
  const style = el.getAttribute('style');
  if (style && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)) return true;
  return false;
}

function emojiText(img: Element): string {
  const plain = img.getAttribute('data-plain-text');
  if (plain) return plain;
  const alt = img.getAttribute('alt');
  if (!alt) return '';
  const cls = img.getAttribute('class') ?? '';
  // Los emojis de WhatsApp son <img class="... emoji ..." alt="😀">. Otras imágenes no aportan texto.
  if (/emoji/i.test(cls) || /\p{Extended_Pictographic}/u.test(alt)) return alt;
  return '';
}

export function extractText(root: Node, options: ExtractOptions = {}): string {
  const out: string[] = [];
  const endsWithNewline = () => {
    const last = out[out.length - 1];
    return out.length === 0 || (last !== undefined && last.endsWith('\n'));
  };

  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out.push(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag)) return;
    if (el.getAttribute('role') === 'button') return;
    if (isHidden(el)) return;
    if (options.exclude?.(el)) return;
    if (tag === 'BR') {
      out.push('\n');
      return;
    }
    if (tag === 'IMG') {
      out.push(emojiText(el));
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block && !endsWithNewline()) out.push('\n');
    for (const child of Array.from(el.childNodes)) walk(child);
    if (block && !endsWithNewline()) out.push('\n');
  };

  walk(root);
  return out
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200e\u200f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^\n+|\n+$/g, '');
}
