/**
 * Simulador del DOM de WhatsApp Web para pruebas (datos 100 % ficticios).
 *
 * Reproduce la estructura pública conocida: #main, cabecera con título,
 * contenedor desplazable, filas con data-id, burbujas message-in/out,
 * data-pre-plain-text, span.selectable-text, emojis como <img alt>, separadores
 * de día, avisos del sistema, carga perezosa al llegar arriba y virtualización.
 *
 * IMPORTANTE: la función es autocontenida (sin imports ni referencias externas)
 * porque Playwright la serializa con page.evaluate().
 */

export interface SimMessage {
  /** Parte final del data-id; null = fila sin data-id. */
  id?: string | null;
  fromMe: boolean;
  sender?: string;
  participant?: string;
  /** AAAA-MM-DD */
  date: string;
  /** HH:MM (24 h) */
  time: string;
  text?: string;
  kind?: 'text' | 'voice' | 'image' | 'document' | 'sticker' | 'video' | 'deleted';
  fileName?: string;
  quote?: { sender: string; text: string };
  edited?: boolean;
  forwarded?: boolean;
  truncated?: boolean;
  /** false = sin data-pre-plain-text (fecha solo por separador). */
  prePlain?: boolean;
}

export type SimItem = SimMessage | { system: string };

export interface SimConfig {
  chatName: string;
  chatJid: string;
  items: SimItem[];
  /** AAAA-MM-DD que el simulador considera "hoy" para HOY/AYER. */
  today: string;
  dateFormat?: 'DMY' | 'MDY';
  timeFormat?: '24' | '12';
  /** Mensajes visibles al abrir (los más recientes). */
  initialWindow?: number;
  pageSize?: number;
  loadDelayMs?: number;
  /** Máximo de filas en el DOM (se descartan las más recientes al cargar antiguas). */
  virtualizeMax?: number;
  /** La carga nunca progresa (spinner eterno). */
  stall?: boolean;
  /** Al llegar al principio: aviso de cifrado (default) o botón de sincronizar con el teléfono. */
  topBehavior?: 'encryption' | 'phone-sync' | 'nothing';
  unreadBanner?: boolean;
}

export function installWhatsAppSim(config: SimConfig, docArg?: Document): void {
  const doc: Document = docArg ?? document;
  const win = doc.defaultView as (Window & { __waSim?: unknown }) | null;
  const cfg = {
    dateFormat: 'DMY' as 'DMY' | 'MDY',
    timeFormat: '24' as '24' | '12',
    initialWindow: 40,
    pageSize: 30,
    loadDelayMs: 30,
    virtualizeMax: 0,
    stall: false,
    topBehavior: 'encryption' as 'encryption' | 'phone-sync' | 'nothing',
    unreadBanner: false,
    ...config,
  };

  let current = cfg;
  let start = Math.max(0, current.items.length - current.initialWindow);
  let end = current.items.length;
  let loading = false;

  const el = (tag: string, attrs: Record<string, string> = {}, children: Array<Node | string> = []) => {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    for (const c of children) node.append(typeof c === 'string' ? doc.createTextNode(c) : c);
    return node;
  };

  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return current.dateFormat === 'MDY' ? `${Number(m)}/${Number(d)}/${y}` : `${d}/${m}/${y}`;
  };
  const fmtTime = (t: string) => {
    if (current.timeFormat === '24') return t;
    const [hh, mm] = t.split(':').map(Number) as [number, number];
    const suffix = hh >= 12 ? 'p.\u00a0m.' : 'a.\u00a0m.';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${String(mm).padStart(2, '0')}\u00a0${suffix}`;
  };
  const addDays = (iso: string, n: number) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  const dayLabel = (iso: string) => {
    if (iso === current.today) return 'HOY';
    if (iso === addDays(current.today, -1)) return 'AYER';
    return fmtDate(iso);
  };

  /** Texto con emojis como <img class="emoji"> , enlaces como <a> y saltos como <br>. */
  const richText = (text: string): Node[] => {
    const out: Node[] = [];
    const lines = text.split('\n');
    lines.forEach((line, li) => {
      if (li > 0) out.push(el('br'));
      const tokens = line.split(/(https?:\/\/\S+|\p{Extended_Pictographic}\ufe0f?)/u).filter((t) => t !== '');
      for (const tok of tokens) {
        if (/^https?:\/\//.test(tok)) out.push(el('a', { href: tok, target: '_blank', rel: 'noopener' }, [tok]));
        else if (/^\p{Extended_Pictographic}/u.test(tok)) out.push(el('img', { class: 'emoji b75', alt: tok, src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }));
        else out.push(el('span', {}, [tok]));
      }
    });
    return out;
  };

  const isMessage = (it: SimItem): it is SimMessage => !('system' in it);

  const renderMessage = (m: SimMessage, index: number): HTMLElement => {
    const isGroup = current.chatJid.endsWith('@g.us');
    const idPart = m.id === undefined ? `3EB0${String(index).padStart(6, '0')}` : m.id;
    const attrs: Record<string, string> = { class: 'focusable-list-item', tabindex: '-1' };
    if (idPart !== null) {
      attrs['data-id'] = `${m.fromMe}_${current.chatJid}_${idPart}${isGroup && !m.fromMe && m.participant ? `_${m.participant}` : ''}`;
    }
    const bubble = el('div', { class: m.fromMe ? 'message-out' : 'message-in' });
    if (isGroup && !m.fromMe) bubble.append(el('span', { 'data-icon': 'default-contact-refreshed' }));
    bubble.append(el('span', { 'data-icon': m.fromMe ? 'tail-out' : 'tail-in' }));
    if (m.forwarded) bubble.append(el('div', {}, [el('span', { 'data-icon': 'forwarded' }), el('span', {}, ['Reenviado'])]));

    const kind = m.kind ?? 'text';
    const sender = m.sender ?? (m.fromMe ? 'Agente Demo' : current.chatName);
    const pre = `[${fmtTime(m.time)}, ${fmtDate(m.date)}] ${sender}: `;
    const usePre = m.prePlain ?? (kind === 'text' || ((kind === 'image' || kind === 'video') && !!m.text));
    const copyable = el('div', usePre ? { class: 'copyable-text', 'data-pre-plain-text': pre } : { class: 'copyable-text' });

    if (m.quote) {
      copyable.append(
        el('div', { 'data-testid': 'quoted-message', role: 'button', 'aria-label': 'Mensaje citado' }, [
          el('span', { dir: 'auto' }, [m.quote.sender]),
          el('span', { class: 'quoted-mention', dir: 'ltr' }, [m.quote.text]),
        ]),
      );
    }
    if (kind === 'voice') {
      bubble.append(el('div', {}, [el('span', { 'data-icon': 'audio-play' }), el('span', { 'data-icon': 'ptt-status' }), el('div', {}, ['0:42'])]));
    } else if (kind === 'image') {
      bubble.append(el('div', {}, [el('img', { src: `blob:https://web.whatsapp.com/${index}`, alt: '' })]));
    } else if (kind === 'video') {
      bubble.append(el('div', {}, [el('span', { 'data-icon': 'media-play' }), el('span', {}, ['0:15'])]));
    } else if (kind === 'sticker') {
      bubble.append(el('div', { 'data-testid': 'sticker' }, [el('img', { src: `blob:https://web.whatsapp.com/s${index}`, alt: '' })]));
    } else if (kind === 'document') {
      const name = m.fileName ?? 'documento.pdf';
      bubble.append(el('div', {}, [el('span', { 'data-icon': 'document-PDF-icon' }), el('span', { title: name }, [name]), el('span', {}, ['2 MB'])]));
    } else if (kind === 'deleted') {
      bubble.append(el('div', {}, [el('span', { 'data-icon': 'recalled' }), el('span', {}, ['Se eliminó este mensaje'])]));
    }
    if (m.text && kind !== 'deleted') {
      const body = el('span', { dir: 'ltr', class: 'selectable-text copyable-text' }, [el('span', {}, richText(m.text))]);
      copyable.append(el('div', {}, [body]));
      if (m.truncated) copyable.append(el('div', { role: 'button' }, ['Leer más']));
    }
    if (copyable.childNodes.length > 0 || usePre) bubble.append(copyable);
    const meta = el('div', {}, []);
    if (m.edited) meta.append(el('span', {}, ['Editado']));
    meta.append(el('span', { dir: 'auto' }, [fmtTime(m.time)]));
    if (m.fromMe) meta.append(el('span', { 'data-icon': 'msg-dblcheck' }));
    bubble.append(meta);
    return el('div', { role: 'row' }, [el('div', attrs, [bubble])]);
  };

  const main = el('div', { id: 'main' });
  const header = el('header', {}, [el('div', {}, [el('span', { dir: 'auto', title: current.chatName }, [current.chatName])])]);
  const scroller = el('div', { 'data-testid': 'conversation-panel-messages', tabindex: '0', style: 'overflow-y: auto; height: 520px;' });
  const list = el('div', { role: 'application' });
  scroller.append(list);
  main.append(header, el('div', { class: 'copyable-area' }, [scroller]), el('footer', {}, [el('div', { contenteditable: 'true', role: 'textbox' })]));
  const app = el('div', { id: 'app' }, [el('div', { id: 'pane-side' }, [el('span', {}, ['Lista de chats (simulada)'])]), main]);
  doc.body.append(app);
  doc.documentElement.lang = 'es';

  const render = () => {
    const rows: Node[] = [];
    if (loading) rows.push(el('div', { role: 'progressbar' }));
    if (start === 0 && !loading) {
      if (current.topBehavior === 'encryption') {
        rows.push(el('div', { role: 'row' }, [el('div', {}, [el('span', {}, ['Los mensajes y las llamadas están cifrados de extremo a extremo. Nadie fuera de este chat, ni siquiera WhatsApp, puede leerlos ni escucharlos.'])])]));
      } else if (current.topBehavior === 'phone-sync') {
        rows.push(el('div', { role: 'button' }, ['Haz clic aquí para obtener mensajes anteriores de tu teléfono.']));
      }
    }
    let prevDate: string | null = null;
    for (let i = start; i < end; i++) {
      const it = current.items[i]!;
      if (isMessage(it)) {
        if (it.date !== prevDate) {
          rows.push(el('div', { role: 'row' }, [el('div', {}, [el('span', {}, [dayLabel(it.date)])])]));
          prevDate = it.date;
        }
        if (current.unreadBanner && i === end - 2) rows.push(el('div', {}, [el('span', {}, ['2 MENSAJES NO LEÍDOS'])]));
        rows.push(renderMessage(it, i));
      } else {
        rows.push(el('div', { role: 'row' }, [el('div', {}, [el('span', {}, [it.system])])]));
      }
    }
    list.replaceChildren(...rows);
  };

  const loadOlder = () => {
    if (loading || start === 0) return;
    loading = true;
    render();
    if (current.stall) return;
    setTimeout(() => {
      start = Math.max(0, start - current.pageSize);
      if (current.virtualizeMax > 0) end = Math.min(end, start + current.virtualizeMax);
      loading = false;
      render();
      scroller.scrollTop = 200;
    }, current.loadDelayMs);
  };

  scroller.addEventListener('scroll', () => {
    if (scroller.scrollTop <= 5) loadOlder();
    if (scroller.scrollHeight > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5 && end < current.items.length) {
      end = current.items.length;
      render();
    }
  });

  const api = {
    switchChat(next: SimConfig) {
      current = { ...cfg, ...next };
      start = Math.max(0, current.items.length - current.initialWindow);
      end = current.items.length;
      loading = false;
      const title = header.querySelector('span[title]')!;
      title.setAttribute('title', current.chatName);
      title.textContent = current.chatName;
      render();
    },
    closeChat() {
      main.remove();
    },
    state: () => ({ start, end, loading, total: current.items.length }),
  };
  if (win) win.__waSim = api;
  render();
}
