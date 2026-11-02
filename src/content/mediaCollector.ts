/**
 * Descarga de fotos, audios y vídeos de los mensajes visibles, solo cuando el
 * usuario lo pide (botón ZIP). Usa la propia interfaz de WhatsApp: abre la foto
 * o el vídeo en el visor y lo cierra, o reproduce la nota de voz en silencio y
 * la pausa. El archivo se obtiene del Blob que WhatsApp ya ha descargado y
 * descifrado (lo reenvía pageHook.ts). Nunca se inventa ni se reasigna un
 * archivo a otro mensaje: si hay duda, el mensaje queda marcado como no incluido.
 */
import type { Message, MessageKind } from '../shared/types';
import { SELECTORS } from '../adapters/whatsapp/selectors';
import { findMessageElements, getMain, queryFirst } from '../adapters/whatsapp/dom';
import { domIdKey } from '../deduplication/keys';

export type CapturedKind = 'image' | 'video' | 'audio' | 'document';

export interface CapturedMedia {
  key: string;
  kind: CapturedKind;
  blob: Blob;
}

export interface MediaStats {
  saved: number;
  failed: number;
  bytes: number;
  images: number;
  videos: number;
  audios: number;
  documents: number;
}

interface Received {
  via: 'create' | 'play' | 'download';
  blob: Blob | null;
  url: string;
  type: string;
  tag: string | null;
}

const FROM_EXT = 'wai-ext';
const FROM_PAGE = 'wai-page';

/** Canal con pageHook.ts (mundo de la página) mediante postMessage con un token por sesión. */
export class PageMediaBridge {
  private token: string | null = null;
  private readonly received: Received[] = [];

  constructor(private readonly win: Window) {}

  private readonly onMessage = (event: MessageEvent) => {
    if (event.source !== this.win || !this.token) return;
    const d = event.data as Partial<Received> & { source?: unknown; token?: unknown; size?: unknown } | null;
    if (!d || d.source !== FROM_PAGE || d.token !== this.token || typeof d.url !== 'string') return;
    const BlobCtor = (this.win as Window & { Blob?: typeof Blob }).Blob ?? Blob;
    this.received.push({
      via: d.via === 'play' || d.via === 'download' ? d.via : 'create',
      blob: (d.blob as unknown) instanceof BlobCtor || (d.blob as unknown) instanceof Blob ? (d.blob as Blob) : null,
      url: d.url,
      type: typeof d.type === 'string' ? d.type : '',
      tag: typeof d.tag === 'string' ? d.tag : null,
    });
  };

  arm(): void {
    if (this.token) return;
    this.token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    this.received.length = 0;
    this.win.addEventListener('message', this.onMessage);
    this.win.postMessage({ source: FROM_EXT, cmd: 'arm', token: this.token }, this.win.location.origin);
  }

  disarm(): void {
    if (!this.token) return;
    this.win.postMessage({ source: FROM_EXT, cmd: 'disarm', token: this.token }, this.win.location.origin);
    this.win.removeEventListener('message', this.onMessage);
    this.token = null;
    this.received.length = 0;
  }

  mark(): number {
    return this.received.length;
  }

  private async resolve(r: Received): Promise<Blob | null> {
    if (r.blob) return r.blob;
    return fetchBlob(r.url);
  }

  /**
   * Espera los Blob del tipo pedido creados desde `since`. Cuando dejan de
   * llegar durante `settleMs` devuelve el mayor (el archivo completo; las
   * miniaturas son más pequeñas). Null si no llega ninguno a tiempo.
   */
  async waitFor(
    kind: CapturedKind,
    since: number,
    opts: { timeoutMs: number; settleMs: number },
    signal: AbortSignal,
  ): Promise<Blob | null> {
    const start = Date.now();
    let count = 0;
    let lastChange = start;
    const prefix = kind === 'document' ? null : `${kind}/`;
    const matches = () =>
      this.received.slice(since).filter((r) => {
        if (r.via === 'download') return kind === 'document' && r.url.startsWith('blob:');
        if (r.via === 'play') return kind === 'audio' && r.tag === 'AUDIO' && r.url.startsWith('blob:');
        const type = r.type.toLowerCase();
        return prefix ? type.startsWith(prefix) : !/^(audio|video|image)\//.test(type);
      });
    while (!signal.aborted && Date.now() - start < opts.timeoutMs) {
      const found = matches();
      if (found.length !== count) {
        count = found.length;
        lastChange = Date.now();
      }
      if (count > 0 && Date.now() - lastChange >= opts.settleMs) break;
      await delay(100);
    }
    const found = matches();
    if (found.length === 0) return null;
    // Documento: el archivo que WhatsApp iba a guardar es el bueno.
    const download = found.filter((r) => r.via === 'download').pop();
    if (download) {
      const blob = await this.resolve(download);
      if (blob) return blob;
    }
    const created = found.filter((r) => r.via === 'create');
    if (created.length > 0) {
      const blobs = (await Promise.all(created.map((r) => this.resolve(r)))).filter((b): b is Blob => b !== null);
      if (blobs.length > 0) return blobs.reduce((a, b) => (b.size > a.size ? b : a));
    }
    // Audio ya descargado antes: WhatsApp reutiliza su URL y solo se ve al reproducir.
    return this.resolve(found[found.length - 1]!);
  }
}

export async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function capturedKind(kind: MessageKind): CapturedKind | null {
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'video';
  if (kind === 'voice' || kind === 'audio') return 'audio';
  if (kind === 'document') return 'document';
  return null;
}

function within(node: Element, container: Element | null): boolean {
  return container !== null && (container === node || container.contains(node));
}

function iconTitles(el: Element): string[] {
  return Array.from(el.querySelectorAll('svg title')).map((t) => (t.textContent ?? '').trim());
}

const CLOSE_LABEL = /^(cerrar|close|tancar|tanca|fechar)$/i;
const CLOSE_ICON = /^(wds-ic-close|ic-close|x-viewer|x|close)$/i;
const DOWNLOAD_LABEL = /^(descargar|download|baixa|baixar)\b/i;
const DOWNLOAD_ICON = /download/i;

export interface CollectorOptions {
  from: string | null;
  to: string | null;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_COLLECTOR_LIMITS = { maxFileBytes: 100 * 1024 * 1024, maxTotalBytes: 700 * 1024 * 1024 };

export class MediaCollector {
  readonly items = new Map<string, CapturedMedia>();
  readonly failures = new Map<string, string>();
  private readonly attempted = new Set<string>();
  private totals: MediaStats = { saved: 0, failed: 0, bytes: 0, images: 0, videos: 0, audios: 0, documents: 0 };

  constructor(
    private readonly doc: Document,
    private readonly bridge: PageMediaBridge,
    private readonly messages: () => Message[],
    private readonly opts: CollectorOptions,
    private readonly onProgress: (current: string) => void,
  ) {}

  stats(): MediaStats {
    return { ...this.totals };
  }

  private inRange(m: Message): boolean {
    const d = m.when.date;
    if (!d) return this.opts.from === null && this.opts.to === null;
    if (this.opts.from && d < this.opts.from) return false;
    if (this.opts.to && d > this.opts.to) return false;
    return true;
  }

  private fail(key: string, reason: string): void {
    this.failures.set(key, reason);
    this.totals.failed++;
  }

  /** Procesa los mensajes con multimedia presentes ahora en el DOM y aún no intentados. */
  async collectVisible(signal: AbortSignal): Promise<void> {
    const main = getMain(this.doc);
    if (!main) return;
    const byKey = new Map(this.messages().map((m) => [m.key, m]));
    for (const el of findMessageElements(main)) {
      if (signal.aborted) return;
      const domId = el.getAttribute('data-id');
      if (!domId) continue;
      const key = domIdKey(domId);
      if (this.attempted.has(key)) continue;
      const msg = byKey.get(key);
      if (!msg) continue;
      const kind = capturedKind(msg.kind);
      if (!kind || !this.inRange(msg)) continue;
      this.attempted.add(key);
      if (!el.isConnected) {
        this.attempted.delete(key);
        continue;
      }
      this.onProgress(kind === 'image' ? 'foto' : kind === 'video' ? 'vídeo' : kind === 'document' ? 'documento' : 'audio');
      let blob: Blob | null = null;
      try {
        blob = await this.captureOne(el, kind, signal);
      } catch {
        blob = null;
      }
      if (signal.aborted && !blob) {
        this.attempted.delete(key);
        return;
      }
      if (!blob || blob.size === 0) {
        this.fail(key, 'WhatsApp no entregó el archivo a tiempo (puede que no esté descargado en este dispositivo)');
        continue;
      }
      if (blob.size > this.opts.maxFileBytes) {
        this.fail(key, `archivo de ${Math.round(blob.size / 1048576)} MB, supera el límite por archivo`);
        continue;
      }
      if (this.totals.bytes + blob.size > this.opts.maxTotalBytes) {
        this.fail(key, 'se alcanzó el tamaño máximo del ZIP');
        continue;
      }
      this.items.set(key, { key, kind, blob });
      this.totals.saved++;
      this.totals.bytes += blob.size;
      if (kind === 'image') this.totals.images++;
      else if (kind === 'video') this.totals.videos++;
      else if (kind === 'document') this.totals.documents++;
      else this.totals.audios++;
      await delay(150);
    }
  }

  private async captureOne(el: Element, kind: CapturedKind, signal: AbortSignal): Promise<Blob | null> {
    const quote = queryFirst(el, SELECTORS.quoted);
    if (kind === 'audio') return this.captureAudio(el, quote, signal);
    if (kind === 'video') return this.captureVideo(el, quote, signal);
    if (kind === 'document') return this.captureDocument(el, quote, signal);
    return this.captureImage(el, quote, signal);
  }

  private async captureAudio(el: Element, quote: Element | null, signal: AbortSignal): Promise<Blob | null> {
    const buttons = Array.from(el.querySelectorAll('button, [role="button"]')).filter((b) => !within(b, quote));
    const play =
      buttons.find((b) => iconTitles(b).some((t) => /play-arrow|^play$|audio-play|ptt-play/i.test(t))) ??
      buttons.find((b) => /reproducir|^play|reprodueix/i.test(b.getAttribute('aria-label') ?? ''));
    if (!play) return null;
    const since = this.bridge.mark();
    (play as HTMLElement).click();
    const blob = await this.bridge.waitFor('audio', since, { timeoutMs: 12_000, settleMs: 400 }, signal);
    const pause = Array.from(el.querySelectorAll('button, [role="button"]')).find(
      (b) => !within(b, quote) && (iconTitles(b).some((t) => /pause/i.test(t)) || /pausar|^pause|pausa/i.test(b.getAttribute('aria-label') ?? '')),
    );
    if (pause) (pause as HTMLElement).click();
    return blob;
  }

  private closeCandidates(): Element[] {
    const main = getMain(this.doc);
    const side = this.doc.querySelector('#pane-side');
    return Array.from(this.doc.querySelectorAll('button, [role="button"]')).filter((b) => {
      if (within(b, main) || within(b, side)) return false;
      return CLOSE_LABEL.test((b.getAttribute('aria-label') ?? '').trim()) || iconTitles(b).some((t) => CLOSE_ICON.test(t));
    });
  }

  /** Cierra el visor que se abrió: el botón Cerrar nuevo o, si no aparece, Escape. */
  private async closeViewer(before: Set<Element>): Promise<void> {
    const fresh = this.closeCandidates().filter((b) => !before.has(b));
    if (fresh.length > 0) {
      (fresh[fresh.length - 1] as HTMLElement).click();
    } else {
      const KeyCtor = this.doc.defaultView?.KeyboardEvent ?? KeyboardEvent;
      const target = this.doc.activeElement ?? this.doc.body;
      target.dispatchEvent(new KeyCtor('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    }
    await delay(400);
  }

  private clickTarget(node: Element): HTMLElement {
    return (node.closest('[role="button"]') ?? node) as HTMLElement;
  }

  private async captureVideo(el: Element, quote: Element | null, signal: AbortSignal): Promise<Blob | null> {
    const content = Array.from(el.querySelectorAll(SELECTORS.videoContent)).find((n) => !within(n, quote));
    if (!content) return null;
    const before = new Set(this.closeCandidates());
    const since = this.bridge.mark();
    this.clickTarget(content).click();
    const blob = await this.bridge.waitFor('video', since, { timeoutMs: 30_000, settleMs: 1500 }, signal);
    await this.closeViewer(before);
    return blob;
  }

  /**
   * Documento (PDF, Word, Excel…): pulsa su botón de descarga o, si ya está
   * descargado, la propia burbuja. Si WhatsApp abre una vista previa, usa su
   * botón Descargar y la cierra. El archivo llega por pageHook sin guardarse
   * en Descargas.
   */
  private async captureDocument(el: Element, quote: Element | null, signal: AbortSignal): Promise<Blob | null> {
    const own = (n: Element) => !within(n, quote);
    const isDownload = (b: Element) =>
      iconTitles(b).some((t) => DOWNLOAD_ICON.test(t)) || DOWNLOAD_LABEL.test((b.getAttribute('aria-label') ?? '').trim());
    const isUiButton = (b: Element) =>
      /reaccionar|react|opciones|options|menú|menu/i.test(b.getAttribute('aria-label') ?? '') ||
      iconTitles(b).some((t) => /expand-more|mood/.test(t));
    const buttons = Array.from(el.querySelectorAll('button, [role="button"]')).filter((b) => own(b) && !isUiButton(b));
    const download = buttons.find(isDownload) ?? null;
    const open = buttons.find((b) => !isDownload(b)) ?? null;
    const before = new Set(this.closeCandidates());

    const attempt = async (target: Element, timeoutMs: number): Promise<Blob | null> => {
      const since = this.bridge.mark();
      (target as HTMLElement).click();
      let blob = await this.bridge.waitFor('document', since, { timeoutMs, settleMs: 800 }, signal);
      const opened = this.closeCandidates().filter((b) => !before.has(b));
      if (!blob && opened.length > 0) {
        // Se abrió una vista previa: su botón Descargar entrega el archivo.
        const main = getMain(this.doc);
        const viewerDownload = Array.from(this.doc.querySelectorAll('button, [role="button"]')).find(
          (b) => !within(b, main) && isDownload(b),
        );
        if (viewerDownload) {
          const again = this.bridge.mark();
          (viewerDownload as HTMLElement).click();
          blob = await this.bridge.waitFor('document', again, { timeoutMs: 20_000, settleMs: 800 }, signal);
        }
      }
      if (opened.length > 0) await this.closeViewer(before);
      return blob;
    };

    let blob: Blob | null = null;
    if (download) blob = await attempt(download, 20_000);
    // Si la primera pulsación solo descargó el archivo dentro de WhatsApp, abrirlo lo entrega.
    if (!blob && open && !signal.aborted) blob = await attempt(open, 12_000);
    return blob;
  }


  /** Imagen principal del visor: la de mayor tamaño en pantalla fuera del chat y de la lista. */
  private viewerImageUrl(): string | null {
    const main = getMain(this.doc);
    const side = this.doc.querySelector('#pane-side');
    let best: { url: string; area: number } | null = null;
    for (const img of Array.from(this.doc.querySelectorAll('img'))) {
      if (within(img, main) || within(img, side)) continue;
      const src = img.getAttribute('src') ?? '';
      if (!src.startsWith('blob:')) continue;
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > 0 && (!best || area > best.area)) best = { url: src, area };
    }
    return best?.url ?? null;
  }

  private async captureImage(el: Element, quote: Element | null, signal: AbortSignal): Promise<Blob | null> {
    const thumb = Array.from(el.querySelectorAll(SELECTORS.imageThumb)).find((n) => !within(n, quote)) ?? null;
    const bubbleImg =
      (thumb ?? el).querySelector('img[src^="blob:"]') ??
      Array.from(el.querySelectorAll('img[src^="blob:"]')).find((n) => !within(n, quote)) ??
      null;
    const bubbleUrl = bubbleImg?.getAttribute('src') ?? null;
    let best: Blob | null = null;
    if (thumb || bubbleImg) {
      const before = new Set(this.closeCandidates());
      this.clickTarget(thumb ?? bubbleImg!).click();
      // Se espera a que el visor muestre una imagen estable (la versión completa).
      let url: string | null = null;
      let stableSince = Date.now();
      const start = Date.now();
      while (!signal.aborted && Date.now() - start < 8000) {
        await delay(200);
        const now = this.viewerImageUrl();
        if (now !== url) {
          url = now;
          stableSince = Date.now();
        } else if (url && Date.now() - stableSince >= 700) {
          break;
        }
      }
      if (url) best = await fetchBlob(url);
      await this.closeViewer(before);
    }
    if (bubbleUrl) {
      const small = await fetchBlob(bubbleUrl);
      if (small && (!best || small.size > best.size)) best = small;
    }
    return best;
  }
}
