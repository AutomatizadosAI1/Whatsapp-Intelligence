/**
 * Simulador del DOM de WhatsApp Web tal y como es en noviembre de 2026
 * (observado en real sin leer contenido): ids opacos en data-id, burbujas
 * data-testid="msg-container", iconos como <title> de SVG, sin clases
 * message-in/out ni JID. Autocontenido para poder pasarlo a page.evaluate.
 * Con realMedia, la foto, la nota de voz y el vídeo se comportan como en
 * WhatsApp: al abrirlos o reproducirlos se crean Blob con URL.createObjectURL.
 */
export interface ModernSimOptions {
  realMedia: boolean;
}

export function installModernSim(opts: ModernSimOptions, targetDoc?: Document): void {
  const doc = targetDoc ?? document;
  const el = (tag: string, attrs: Record<string, string> = {}, ...children: Array<Node | string>): HTMLElement => {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    for (const c of children) node.append(typeof c === 'string' ? doc.createTextNode(c) : c);
    return node;
  };
  const icon = (name: string): Element => {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const title = doc.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = name;
    svg.append(title);
    return svg;
  };
  const meta = (time: string, status: string | null): HTMLElement => {
    const m = el('div', { 'data-testid': 'msg-meta' }, el('span', {}, time));
    if (status) m.append(el('span', { 'aria-label': ' Leído ' }, icon(status)));
    return m;
  };
  const makeBlob = (n: number, seed: number, type: string): Blob => {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) % 251;
    return new Blob([b], { type });
  };

  const row = (id: string, ...content: Node[]): HTMLElement =>
    el('div', {}, el('div', { role: 'row' }, el('div', { 'data-id': id, 'data-testid': `conv-msg-${id}` }, ...content)));

  const bubble = (dir: 'in' | 'out', first: boolean, ...content: Node[]): HTMLElement => {
    const c = el('div', { 'data-testid': 'msg-container' });
    if (first) c.append(el('span', { 'data-testid': dir === 'out' ? 'tail-out' : 'tail-in' }, icon(dir === 'out' ? 'tail-out' : 'tail-in')));
    if (dir === 'out' && first) c.append(el('span', { 'aria-label': 'Tú:' }));
    for (const n of content) c.append(n);
    return c;
  };
  const text = (pre: string, body: string): HTMLElement =>
    el('div', { class: 'copyable-text', 'data-pre-plain-text': pre }, el('span', { class: 'selectable-text copyable-text', dir: 'ltr' }, el('span', {}, body)));

  const openViewer = (content: Node): void => {
    const viewer = el('div', { id: 'sim-viewer', role: 'dialog', style: 'position:fixed;inset:0;background:#000' });
    const close = el('div', { role: 'button', 'aria-label': 'Cerrar' }, icon('wds-ic-close'));
    close.addEventListener('click', () => viewer.remove());
    viewer.append(close, content);
    doc.body.append(viewer);
  };

  // Foto: miniatura en la burbuja; al abrirla, el visor muestra la imagen completa.
  const thumbImg = el('img', { src: 'blob:https://web.whatsapp.com/miniatura-simulada', style: 'width:120px;height:90px' });
  if (opts.realMedia) thumbImg.setAttribute('src', URL.createObjectURL(makeBlob(800, 3, 'image/png')));
  const thumb = el('div', { role: 'button', 'data-testid': 'image-thumb' }, thumbImg);
  thumb.addEventListener('click', () => {
    if (!opts.realMedia) return;
    setTimeout(() => {
      const full = el('img', { src: URL.createObjectURL(makeBlob(20_000, 7, 'image/png')), style: 'width:600px;height:450px;display:block' });
      openViewer(full);
    }, 150);
  });

  // Nota de voz recibida: al reproducirla se crea el audio.
  const play = el('button', { 'aria-label': 'Reproducir mensaje de voz' }, icon('ic-play-arrow-filled'));
  play.addEventListener('click', () => {
    if (!opts.realMedia) return;
    setTimeout(() => {
      const url = URL.createObjectURL(makeBlob(5_000, 11, 'audio/ogg; codecs=opus'));
      void new Audio(url).play().catch(() => undefined);
      play.setAttribute('aria-label', 'Pausar');
      play.replaceChildren(icon('ic-pause'));
    }, 120);
  });

  // Vídeo enviado: al abrirlo se crea el vídeo y se abre el visor.
  const video = el('div', { role: 'button', 'data-testid': 'video-content' }, icon('ic-videocam-filled'), el('span', {}, '0:07'));
  video.addEventListener('click', () => {
    if (!opts.realMedia) return;
    setTimeout(() => {
      URL.createObjectURL(makeBlob(30_000, 13, 'video/mp4'));
      openViewer(el('video', { style: 'width:480px;height:270px' }));
    }, 150);
  });

  // Documento: el botón Descargar hace lo que WhatsApp, un enlace blob: con descarga.
  const docBox = el(
    'div',
    { role: 'button' },
    icon('wds-ic-file-generic'),
    el('div', {}, el('span', {}, 'presupuesto-octubre.pdf')),
    el('div', {}, el('span', {}, 'PDF • 2 páginas • 12 kB')),
  );
  const docDownload = el('button', { 'aria-label': 'Descargar' }, icon('ic-download'));
  docDownload.addEventListener('click', () => {
    if (!opts.realMedia) return;
    setTimeout(() => {
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(makeBlob(12_345, 17, 'application/pdf'));
      a.download = 'presupuesto-octubre.pdf';
      a.click();
    }, 200);
  });

  const day = el('div', {}, el('div', {}, el('span', {}, '25/10/2026')));
  const list = el(
    'div',
    {},
    day,
    row('3A00000000000000AA01', bubble('in', true, text('[10:00, 25/10/2026] Cliente Moderno: ', 'Hola, os paso la factura'), meta('10:00', null))),
    row('3EB0000000000000AA0201', bubble('out', true, text('[10:01, 25/10/2026] Agente Demo: ', 'Recibido, gracias'), meta('10:01', 'wds-ic-read'))),
    row('3A00000000000000AA03', bubble('in', true, thumb, meta('10:02', null))),
    row('3A00000000000000AA04', bubble('in', false, play, icon('ic-keyboard-voice-filled'), el('div', {}, el('span', {}, '0:12')), meta('10:03', null))),
    row('3EB0000000000000AA0501', bubble('out', true, video, meta('10:04', 'wds-ic-delivered'))),
    row('3A00000000000000AA06'),
    row('3A00000000000000AA07', bubble('in', false, text('[10:05, 25/10/2026] Cliente Moderno: ', '¿Lo veis bien?'), meta('10:05', null))),
    // Icono con nombre desconocido a propósito: se reconoce como documento por el nombre de archivo.
    row('3A00000000000000AA08', bubble('in', false, docBox, docDownload, meta('10:06', null))),
  );
  const panel = el(
    'div',
    { 'data-testid': 'conversation-panel-messages', tabindex: '0', style: 'overflow-y:auto;height:600px' },
    el('div', {}, el('div', {}, 'Usa WhatsApp en tu teléfono para ver mensajes anteriores al 1/10/2026.')),
    list,
  );
  const header = el(
    'header',
    {},
    el('div', { 'data-testid': 'conversation-info-header-chat-title' }, el('span', { dir: 'auto' }, 'Cliente Moderno SL')),
  );
  doc.body.append(el('div', { id: 'main' }, header, panel));
}
