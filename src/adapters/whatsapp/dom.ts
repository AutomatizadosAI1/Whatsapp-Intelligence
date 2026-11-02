/**
 * Adaptador de lectura del DOM de WhatsApp Web. Solo lee: no hace clic, no
 * escribe en la página y no accede a almacenamiento ni APIs internas.
 */
import type { ChatInfo, Direction, MessageKind, RawMessage } from '../../shared/types';
import { extractText } from '../../extraction/text';
import { cleanVisibleText, isDayLabel, looksLikeTime } from '../../normalization/dates';
import {
  IGNORED_ICON_RE,
  MEDIA_SIGNALS,
  MESSAGE_ID_RE,
  OPAQUE_MESSAGE_ID_RE,
  OUTGOING_STATUS_ICON_RE,
  SELECTORS,
  SELF_AUTHOR_LABEL_RE,
  TEXT_PATTERNS,
} from './selectors';

export function queryFirst(root: ParentNode, selectors: readonly string[]): Element | null {
  for (const sel of selectors) {
    try {
      const found = root.querySelector(sel);
      if (found) return found;
    } catch {
      // selector no soportado por este motor: se prueba el siguiente
    }
  }
  return null;
}

export function getMain(doc: Document): Element | null {
  return queryFirst(doc, SELECTORS.main);
}

export interface ParsedMessageId {
  fromMe: boolean;
  chatJid: string;
  msgId: string;
  participantJid: string | null;
}

export function parseMessageId(id: string | null | undefined): ParsedMessageId | null {
  if (!id) return null;
  const m = MESSAGE_ID_RE.exec(id);
  if (!m) return null;
  return { fromMe: m[1] === 'true', chatJid: m[2]!, msgId: m[3]!, participantJid: m[4] ?? null };
}

export function isMessageElement(el: Element): boolean {
  const id = el.getAttribute('data-id') ?? '';
  return MESSAGE_ID_RE.test(id) || OPAQUE_MESSAGE_ID_RE.test(id);
}

/**
 * Fila con id opaco que WhatsApp aún no ha pintado (sin burbuja, texto ni
 * imágenes). No es un mensaje legible: se ignora en vez de inventar contenido.
 */
function isEmptyPlaceholder(el: Element): boolean {
  if (MESSAGE_ID_RE.test(el.getAttribute('data-id') ?? '')) return false;
  if (el.querySelector(SELECTORS.msgContainer) || el.querySelector('img')) return false;
  return (el.textContent ?? '').trim() === '';
}

/** Nombres de iconos de interfaz: data-icon, data-testid y <title> de los SVG. */
function iconNames(el: Element, quote: Element | null): string[] {
  const names: string[] = [];
  for (const title of Array.from(el.getElementsByTagName('title'))) {
    if (within(title, quote) || title.parentElement?.tagName.toLowerCase() !== 'svg') continue;
    const t = (title.textContent ?? '').trim();
    if (t) names.push(t);
  }
  for (const node of Array.from(el.querySelectorAll('[data-icon], [data-testid]'))) {
    if (within(node, quote)) continue;
    for (const attr of ['data-icon', 'data-testid']) {
      const v = node.getAttribute(attr);
      if (v) names.push(v);
    }
  }
  return names;
}

/** Dirección por la posición de la burbuja (derecha = propio). Null si no hay geometría. */
function geometryDirection(bubble: Element): Direction | null {
  const r = bubble.getBoundingClientRect();
  const container = bubble.closest('[data-testid="conversation-panel-messages"]') ?? bubble.ownerDocument.querySelector('#main');
  if (!container || r.width === 0) return null;
  const c = container.getBoundingClientRect();
  if (c.width === 0) return null;
  const left = r.left - c.left;
  const right = c.right - r.right;
  if (Math.abs(left - right) < 24) return null;
  return left > right ? 'out' : 'in';
}

/**
 * Dirección en el DOM actual de WhatsApp (sin clases message-in/out ni JID en
 * el id): iconos de estado de entrega, etiqueta "Tú:" y posición de la burbuja.
 */
function modernDirection(el: Element, bubble: Element, quote: Element | null): Direction {
  const icons = iconNames(el, quote);
  if (icons.some((i) => OUTGOING_STATUS_ICON_RE.test(i) || i === 'tail-out')) return 'out';
  const selfLabel = Array.from(el.querySelectorAll('[aria-label]')).some(
    (n) => !within(n, quote) && SELF_AUTHOR_LABEL_RE.test((n.getAttribute('aria-label') ?? '').trim()),
  );
  if (selfLabel) return 'out';
  return geometryDirection(bubble) ?? 'in';
}

/** Elementos de mensaje más externos dentro de `scope`, en orden de documento. */
export function findMessageElements(scope: ParentNode): Element[] {
  const all = Array.from(scope.querySelectorAll(SELECTORS.messageId)).filter(isMessageElement);
  if (all.length < 2) return all;
  const set = new Set(all);
  return all.filter((el) => {
    let p = el.parentElement;
    while (p) {
      if (set.has(p)) return false;
      if (p === scope) break;
      p = p.parentElement;
    }
    return true;
  });
}

function containsMessage(el: Element): boolean {
  for (const c of Array.from(el.querySelectorAll(SELECTORS.messageId))) if (isMessageElement(c)) return true;
  return false;
}

export function readChatTitle(doc: Document): string | null {
  const el = queryFirst(doc, SELECTORS.headerTitle);
  if (!el) return null;
  const raw = el.getAttribute('title') || el.textContent || '';
  const name = cleanVisibleText(raw).replace(/\s+/g, ' ').trim();
  return name || null;
}

export function readChatInfo(doc: Document): ChatInfo | null {
  const main = getMain(doc);
  if (!main) return null;
  const title = readChatTitle(doc);
  const ids = findMessageElements(main)
    .map((el) => parseMessageId(el.getAttribute('data-id')))
    .filter((p): p is ParsedMessageId => p !== null);
  // El JID que más se repite entre los mensajes del panel identifica el chat.
  const counts = new Map<string, number>();
  for (const p of ids) counts.set(p.chatJid, (counts.get(p.chatJid) ?? 0) + 1);
  let jid: string | null = null;
  let best = 0;
  for (const [k, v] of counts) if (v > best) [jid, best] = [k, v];
  if (jid) {
    return { key: jid, keySource: 'jid', name: title ?? 'Chat sin nombre visible', isGroup: jid.endsWith('@g.us') };
  }
  if (!title) return null;
  const isGroup = queryFirst(main, SELECTORS.groupHints) !== null;
  return { key: `title:${title}`, keySource: 'title', name: title, isGroup };
}

function isScrollable(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const oy = view.getComputedStyle(el).overflowY;
  return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
}

export function findScrollContainer(doc: Document): HTMLElement | null {
  const main = getMain(doc);
  if (!main) return null;
  const first = findMessageElements(main)[0];
  if (first) {
    let el: Element | null = first.parentElement;
    while (el && el !== main.parentElement) {
      if (isScrollable(el)) return el as HTMLElement;
      el = el.parentElement;
    }
  }
  return queryFirst(doc, SELECTORS.scrollContainer) as HTMLElement | null;
}

type WalkItem =
  | { type: 'message'; el: Element }
  | { type: 'day'; text: string }
  | { type: 'system'; text: string }
  | { type: 'skip-phone-sync'; text: string };

function bubbleCount(el: Element): number {
  const sel = `${SELECTORS.incoming}, ${SELECTORS.outgoing}, ${SELECTORS.msgContainer}`;
  return el.querySelectorAll(sel).length + (el.matches(sel) ? 1 : 0);
}

function walkConversation(scope: Element, now: Date): WalkItem[] {
  const items: WalkItem[] = [];
  const visit = (el: Element) => {
    if (isMessageElement(el)) {
      if (!isEmptyPlaceholder(el)) items.push({ type: 'message', el });
      return;
    }
    const bubbles = bubbleCount(el);
    if (containsMessage(el) || bubbles > 1) {
      for (const child of Array.from(el.children)) visit(child);
      return;
    }
    if (bubbles === 1) {
      // Burbuja sin data-id: se trata como mensaje y recibirá una huella.
      items.push({ type: 'message', el });
      return;
    }
    const tag = el.tagName.toUpperCase();
    if (tag === 'BUTTON' || tag === 'HEADER' || tag === 'FOOTER') {
      if (TEXT_PATTERNS.phoneSync.test(cleanVisibleText(el.textContent ?? ''))) {
        items.push({ type: 'skip-phone-sync', text: cleanVisibleText(el.textContent ?? '').trim() });
      }
      return;
    }
    const text = cleanVisibleText(extractText(el)).replace(/[ \t]+/g, ' ').trim();
    if (!text) {
      // Un botón de "obtener mensajes del teléfono" puede ser un role=button sin texto extraíble.
      if (TEXT_PATTERNS.phoneSync.test(cleanVisibleText(el.textContent ?? ''))) {
        items.push({ type: 'skip-phone-sync', text: cleanVisibleText(el.textContent ?? '').trim() });
      }
      return;
    }
    if (TEXT_PATTERNS.phoneSync.test(text)) {
      items.push({ type: 'skip-phone-sync', text });
      return;
    }
    if (TEXT_PATTERNS.unreadBanner.test(text) || TEXT_PATTERNS.loadingText.test(text)) return;
    if (isDayLabel(text, now)) {
      items.push({ type: 'day', text });
      return;
    }
    items.push({ type: 'system', text });
  };
  for (const child of Array.from(scope.children)) visit(child);
  return items;
}

interface RowContext {
  dayLabel: string | null;
  classesAvailable: boolean;
  domIndex: number;
}

function within(el: Element, container: Element | null): boolean {
  return container !== null && (container === el || container.contains(el));
}

function outermost(elements: Element[]): Element[] {
  return elements.filter((el) => !elements.some((other) => other !== el && other.contains(el)));
}

function detectMediaKind(el: Element, quote: Element | null): MessageKind | null {
  const signals = iconNames(el, quote).filter((v) => !IGNORED_ICON_RE.test(v));
  for (const { kind, re } of MEDIA_SIGNALS) {
    if (signals.some((s) => re.test(s))) return kind;
  }
  if (Array.from(el.querySelectorAll('audio')).some((a) => !within(a, quote))) return 'audio';
  if (Array.from(el.querySelectorAll('video')).some((v) => !within(v, quote))) return 'video';
  const blobImg = Array.from(el.querySelectorAll('img')).some(
    (img) => !within(img, quote) && (img.getAttribute('src') ?? '').startsWith('blob:'),
  );
  if (blobImg) return 'image';
  return null;
}

const FILE_NAME_RE = /^[^\n/\\]{1,200}\.[A-Za-z0-9]{2,6}$/;

function detectFileName(el: Element, quote: Element | null): string | null {
  for (const node of Array.from(el.querySelectorAll('[title]'))) {
    if (within(node, quote)) continue;
    const t = cleanVisibleText(node.getAttribute('title') ?? '').trim();
    if (FILE_NAME_RE.test(t) && !looksLikeTime(t)) return t;
  }
  for (const span of Array.from(el.querySelectorAll('span'))) {
    if (span.childElementCount > 0 || within(span, quote)) continue;
    const t = cleanVisibleText(span.textContent ?? '').trim();
    if (FILE_NAME_RE.test(t) && !/^\d+([.,]\d+)?\s?(kb|mb|gb)$/i.test(t)) return t;
  }
  return null;
}

/** Convierte un elemento de mensaje en RawMessage. Función de lectura pura sobre el DOM. */
export function parseMessageElement(el: Element, ctx: RowContext): RawMessage {
  const domId = el.getAttribute('data-id');
  const parsed = parseMessageId(domId);
  const hasOut = el.matches(SELECTORS.outgoing) || el.querySelector(SELECTORS.outgoing) !== null;
  const hasIn = el.matches(SELECTORS.incoming) || el.querySelector(SELECTORS.incoming) !== null;
  const quote = queryFirst(el, SELECTORS.quoted);
  const bubble = el.matches(SELECTORS.msgContainer)
    ? el
    : Array.from(el.querySelectorAll(SELECTORS.msgContainer)).find((n) => !within(n, quote)) ?? null;
  let direction: Direction;
  if (hasOut || hasIn) direction = parsed ? (parsed.fromMe ? 'out' : 'in') : hasOut ? 'out' : 'in';
  else if (ctx.classesAvailable) direction = 'system';
  else if (parsed) direction = parsed.fromMe ? 'out' : 'in';
  else if (bubble) direction = modernDirection(el, bubble, quote);
  else direction = 'system';
  const excludeQuote = (node: Element) => quote !== null && node === quote;

  const prePlainEl = Array.from(el.querySelectorAll(SELECTORS.prePlainText)).find((n) => !within(n, quote)) ?? null;
  const prePlainText = prePlainEl?.getAttribute('data-pre-plain-text') ?? null;

  const bodyCandidates = outermost(
    Array.from(el.querySelectorAll(SELECTORS.bodyText.join(','))).filter((n) => !within(n, quote)),
  );
  let text = bodyCandidates
    .map((n) => extractText(n, { exclude: excludeQuote }))
    .filter((t) => t.length > 0)
    .join('\n');

  let truncated = false;
  let edited = false;
  let forwarded = false;
  let deletedText = false;
  let timeText: string | null = null;
  for (const node of Array.from(el.querySelectorAll('span, div, a, [role="button"]'))) {
    if (node.childElementCount > 0 && node.getAttribute('role') !== 'button') continue;
    if (within(node, quote)) continue;
    const t = cleanVisibleText(node.textContent ?? '').trim();
    if (!t) continue;
    if (TEXT_PATTERNS.readMore.test(t)) truncated = true;
    const inBody = bodyCandidates.some((b) => b.contains(node));
    if (inBody) continue;
    if (TEXT_PATTERNS.edited.test(t)) edited = true;
    else if (TEXT_PATTERNS.forwarded.test(t)) forwarded = true;
    else if (TEXT_PATTERNS.deleted.test(t)) deletedText = true;
    else if (looksLikeTime(t)) timeText = t;
  }
  if (Array.from(el.querySelectorAll('[data-icon]')).some((n) => /^forwarded/i.test(n.getAttribute('data-icon') ?? ''))) {
    forwarded = true;
  }
  if (TEXT_PATTERNS.deleted.test(text.trim())) deletedText = true;
  // La hora del pie de la burbuja manda sobre otros textos con forma de hora (p. ej. la duración de un audio).
  const meta = bubble ? Array.from(el.querySelectorAll(SELECTORS.msgMeta)).find((n) => !within(n, quote)) : undefined;
  if (meta) {
    for (const leaf of Array.from(meta.querySelectorAll('span, div'))) {
      if (leaf.childElementCount > 0) continue;
      const t = cleanVisibleText(leaf.textContent ?? '').trim();
      if (looksLikeTime(t)) timeText = t;
    }
  }
  let senderLabel: string | null = null;
  if (direction === 'in' && bubble) {
    const author = Array.from(el.querySelectorAll(SELECTORS.author)).find((n) => !within(n, quote));
    const name = author ? cleanVisibleText(extractText(author)).replace(/\s+/g, ' ').replace(/:$/, '').trim() : '';
    if (name && !SELF_AUTHOR_LABEL_RE.test(name)) senderLabel = name;
  }

  let quoteData: RawMessage['quote'] = null;
  if (quote) {
    const mention = queryFirst(quote, SELECTORS.quotedText);
    const qText = extractText(mention ?? quote);
    const senderEl = Array.from(quote.querySelectorAll('span[dir="auto"], span[dir="ltr"]')).find(
      (s) => !(mention && (mention.contains(s) || s.contains(mention))) && cleanVisibleText(s.textContent ?? '').trim(),
    );
    const qSender = senderEl ? cleanVisibleText(senderEl.textContent ?? '').trim() : null;
    quoteData = { sender: qSender && qSender !== qText ? qSender : null, text: qText };
  }

  let kind: MessageKind;
  let media = detectMediaKind(el, quote);
  let mediaLabel: string | null = null;
  // Burbuja sin texto propio que solo muestra un nombre de archivo: es un documento
  // aunque WhatsApp cambie el nombre de su icono.
  if (!media && bubble && !text && detectFileName(el, quote)) media = 'document';
  if (media === 'deleted' || deletedText) {
    kind = 'deleted';
    text = '';
  } else if (media) {
    kind = media;
    if (media === 'document') mediaLabel = detectFileName(el, quote);
  } else if (text) {
    kind = 'text';
  } else if (direction === 'system') {
    kind = 'system';
  } else {
    kind = 'unknown';
  }
  if (direction === 'system' && !text) {
    text = cleanVisibleText(extractText(el)).trim();
    if (kind === 'unknown') kind = 'system';
  }

  return {
    domId,
    chatJid: parsed?.chatJid ?? null,
    participantJid: parsed?.participantJid ?? null,
    direction,
    prePlainText,
    senderLabel,
    timeText,
    dayLabel: ctx.dayLabel,
    kind,
    text,
    quote: quoteData,
    mediaLabel,
    edited,
    forwarded,
    truncated,
    domIndex: ctx.domIndex,
  };
}

export interface DomSnapshot {
  chat: ChatInfo | null;
  raws: RawMessage[];
  /** Aviso de cifrado visible antes de cualquier mensaje: evidencia de inicio del chat. */
  startMarker: boolean;
  phoneSync: boolean;
  /** Texto del aviso de WhatsApp sobre historial que solo está en el teléfono. */
  phoneSyncNotice: string | null;
  loading: boolean;
  /** Clave del mensaje más antiguo presente en el DOM (para detectar progreso). */
  topKey: string | null;
  domCount: number;
  foreignDropped: number;
}

export function readSnapshot(doc: Document, now: Date): DomSnapshot {
  const chat = readChatInfo(doc);
  const main = getMain(doc);
  const empty: DomSnapshot = {
    chat, raws: [], startMarker: false, phoneSync: false, phoneSyncNotice: null, loading: false, topKey: null, domCount: 0, foreignDropped: 0,
  };
  if (!chat || !main) return empty;
  const scope = findScrollContainer(doc) ?? main;
  const classesAvailable = scope.querySelector(`${SELECTORS.incoming}, ${SELECTORS.outgoing}`) !== null;
  const items = walkConversation(scope, now);

  const raws: RawMessage[] = [];
  let dayLabel: string | null = null;
  let startMarker = false;
  let phoneSync = false;
  let phoneSyncNotice: string | null = null;
  let seenMessage = false;
  let foreignDropped = 0;
  let domCount = 0;
  for (const item of items) {
    if (item.type === 'day') {
      dayLabel = item.text;
    } else if (item.type === 'skip-phone-sync') {
      phoneSync = true;
      if (item.text) phoneSyncNotice = item.text;
    } else if (item.type === 'system') {
      if (!seenMessage && TEXT_PATTERNS.encryptionNotice.test(item.text)) startMarker = true;
      raws.push({
        domId: null, chatJid: null, participantJid: null, direction: 'system', prePlainText: null, senderLabel: null,
        timeText: null, dayLabel, kind: 'system', text: item.text, quote: null, mediaLabel: null,
        edited: false, forwarded: false, truncated: false, domIndex: raws.length,
      });
    } else {
      domCount++;
      const raw = parseMessageElement(item.el, { dayLabel, classesAvailable, domIndex: raws.length });
      // Protección contra mezcla de chats: se descarta lo que no pertenezca al chat activo.
      if (chat.keySource === 'jid' && raw.chatJid && raw.chatJid !== chat.key) {
        foreignDropped++;
        continue;
      }
      if (raw.direction === 'system' && !seenMessage && TEXT_PATTERNS.encryptionNotice.test(raw.text)) startMarker = true;
      if (raw.direction !== 'system') seenMessage = true;
      raws.push(raw);
    }
  }
  const loading = queryFirst(scope, SELECTORS.loading) !== null;
  const firstWithId = raws.find((r) => r.domId);
  return {
    chat,
    raws,
    startMarker,
    phoneSync,
    phoneSyncNotice,
    loading,
    topKey: firstWithId?.domId ?? (raws[0] ? `${raws[0].kind}:${raws[0].text.slice(0, 40)}` : null),
    domCount,
    foreignDropped,
  };
}

/** Cuenta rápida de mensajes en el DOM (sin parsear). */
export function countDomMessages(doc: Document): number {
  const main = getMain(doc);
  return main ? findMessageElements(main).filter((el) => !isEmptyPlaceholder(el)).length : 0;
}

/** Desplaza el contenedor hacia los mensajes más antiguos. */
export function scrollToOldest(container: HTMLElement): void {
  if (container.scrollTop <= 0) container.scrollTop = 1;
  container.scrollTop = 0;
  const EventCtor = container.ownerDocument.defaultView?.Event ?? Event;
  container.dispatchEvent(new EventCtor('scroll', { bubbles: false }));
}

export function scrollToNewest(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

/**
 * Diagnóstico estructural SIN contenido: solo contadores y nombres de iconos de
 * interfaz, para ajustar selectores si WhatsApp cambia su DOM.
 */
export function collectDiagnostics(doc: Document): Record<string, unknown> {
  const main = getMain(doc);
  const container = findScrollContainer(doc);
  const messages = main ? findMessageElements(main) : [];
  const icons = new Map<string, number>();
  for (const el of messages) {
    for (const n of Array.from(el.querySelectorAll('[data-icon]'))) {
      const v = n.getAttribute('data-icon') ?? '';
      if (/^[a-z0-9-]{1,40}$/i.test(v)) icons.set(v, (icons.get(v) ?? 0) + 1);
    }
  }
  const selectorHits: Record<string, number> = {};
  for (const [name, sels] of Object.entries(SELECTORS)) {
    const list: readonly string[] = typeof sels === 'string' ? [sels] : sels;
    let hits = 0;
    for (const sel of list) {
      try {
        hits += doc.querySelectorAll(sel).length;
      } catch {
        // selector no soportado
      }
    }
    selectorHits[name] = hits;
  }
  return {
    url: doc.location?.hostname ?? null,
    lang: doc.documentElement.lang || null,
    mainFound: main !== null,
    titleFound: readChatTitle(doc) !== null,
    scrollContainerFound: container !== null,
    scrollContainerByStyle: container !== null && isScrollable(container),
    messageElements: messages.length,
    withPrePlainText: messages.filter((m) => m.querySelector(SELECTORS.prePlainText)).length,
    incoming: messages.filter((m) => m.matches(SELECTORS.incoming) || m.querySelector(SELECTORS.incoming)).length,
    outgoing: messages.filter((m) => m.matches(SELECTORS.outgoing) || m.querySelector(SELECTORS.outgoing)).length,
    withBodyText: messages.filter((m) => m.querySelector(SELECTORS.bodyText.join(','))).length,
    selectorHits,
    icons: Object.fromEntries([...icons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)),
  };
}
