/**
 * Script en el "mundo" de la página (world: MAIN). Está inactivo por defecto:
 * solo actúa entre la orden "arm" y "disarm" que envía el content script de
 * esta extensión durante una descarga de multimedia pedida por el usuario.
 *
 * Mientras está activo:
 * - Reenvía al content script los Blob que WhatsApp crea con
 *   URL.createObjectURL al abrir, reproducir o descargar un archivo (es el
 *   propio archivo ya descargado y descifrado por WhatsApp; no se toca ninguna
 *   API interna).
 * - Silencia la reproducción de audio/vídeo para no hacer ruido.
 * - Cuando WhatsApp intenta guardar o abrir un documento (enlace blob: con
 *   descarga o ventana nueva), lo entrega al content script en lugar de llenar
 *   la carpeta de Descargas o abrir pestañas: el archivo acaba dentro del ZIP.
 * No envía nada fuera del navegador.
 */
(() => {
  const FROM_EXT = 'wai-ext';
  const FROM_PAGE = 'wai-page';
  let token: string | null = null;
  const muted = new Set<HTMLMediaElement>();

  const post = (data: Record<string, unknown>) => {
    if (!token) return;
    window.postMessage({ source: FROM_PAGE, token, ...data }, location.origin);
  };

  const originalCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function createObjectURL(obj: Blob | MediaSource): string {
    const url = originalCreate(obj);
    if (token && obj instanceof Blob && obj.size > 0) {
      try {
        post({ via: 'create', blob: obj, url, type: obj.type, tag: null });
      } catch {
        // si el Blob no se puede clonar, se envía solo la URL
        post({ via: 'create', blob: null, url, type: obj.type, tag: null });
      }
    }
    return url;
  };

  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement): Promise<void> {
    if (token) {
      if (!this.muted) {
        this.muted = true;
        muted.add(this);
      }
      const url = this.currentSrc || this.src;
      if (url) post({ via: 'play', blob: null, url, type: '', tag: this.tagName });
    }
    return originalPlay.call(this);
  };

  const isBlobDownload = (a: HTMLAnchorElement) => a.href.startsWith('blob:');

  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement): void {
    if (token && isBlobDownload(this)) {
      post({ via: 'download', blob: null, url: this.href, type: '', tag: 'A', name: this.download || null });
      return;
    }
    originalClick.call(this);
  };

  const originalDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function dispatchEvent(this: EventTarget, event: Event): boolean {
    if (token && event.type === 'click' && this instanceof HTMLAnchorElement && isBlobDownload(this)) {
      post({ via: 'download', blob: null, url: this.href, type: '', tag: 'A', name: this.download || null });
      return false;
    }
    return originalDispatch.call(this, event);
  };

  const originalOpen = window.open.bind(window);
  window.open = function open(url?: string | URL, target?: string, features?: string): WindowProxy | null {
    const href = url === undefined ? '' : String(url);
    if (token && href.startsWith('blob:')) {
      post({ via: 'download', blob: null, url: href, type: '', tag: 'WINDOW', name: null });
      return null;
    }
    return originalOpen(url, target, features);
  };

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as { source?: unknown; cmd?: unknown; token?: unknown } | null;
    if (!data || data.source !== FROM_EXT || typeof data.token !== 'string') return;
    if (data.cmd === 'arm') {
      token = data.token;
    } else if (data.cmd === 'disarm' && data.token === token) {
      token = null;
      for (const el of muted) {
        try {
          el.pause();
          el.muted = false;
        } catch {
          // elemento ya descartado por WhatsApp
        }
      }
      muted.clear();
    }
  });
})();
