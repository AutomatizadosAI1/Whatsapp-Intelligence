import { describe, expect, it } from 'vitest';
import { extractText } from '../../extraction/text';
import { readSnapshot, readChatInfo, collectDiagnostics } from '../../adapters/whatsapp/dom';
import { htmlDom, simDom, extractFromSim } from './helpers';
import { groupChat, individualChat, richConversation, NOW, TODAY } from '../fixtures/generators';

describe('extractText', () => {
  it('conserva emojis, saltos de línea y texto de enlaces sin HTML', () => {
    const doc = htmlDom(
      '<span id="t">Hola <img class="emoji" alt="😀" src="x"><br>Mira <a href="https://example.com/x?a=1">https://example.com/x?a=1</a><button>Leer más</button><svg><text>no</text></svg><span aria-hidden="true">oculto</span></span>',
    );
    expect(extractText(doc.getElementById('t')!)).toBe('Hola 😀\nMira https://example.com/x?a=1');
  });
  it('no ejecuta ni interpreta HTML malicioso del contenido', () => {
    const doc = htmlDom('<span id="t"></span>');
    const span = doc.getElementById('t')!;
    span.append(doc.createTextNode('<img src=x onerror=alert(1)> & <b>negrita</b>'));
    expect(extractText(span)).toBe('<img src=x onerror=alert(1)> & <b>negrita</b>');
  });
  it('ignora imágenes que no son emojis', () => {
    const doc = htmlDom('<span id="t">a<img alt="foto de perfil" src="x">b</span>');
    expect(extractText(doc.getElementById('t')!)).toBe('ab');
  });
});

describe('adaptador DOM de WhatsApp', () => {
  it('detecta el chat por el JID de los mensajes y el título', () => {
    const { doc } = simDom(individualChat(richConversation()));
    expect(readChatInfo(doc)).toEqual({ key: '34600000001@c.us', keySource: 'jid', name: 'Cliente Ficticio SL', isGroup: false });
  });

  it('sin #main no hay chat', () => {
    expect(readChatInfo(htmlDom('<div id="app"></div>'))).toBeNull();
  });

  it('extrae todos los tipos de mensaje de una conversación rica', () => {
    const { snap, store } = extractFromSim(individualChat(richConversation()));
    expect(snap.startMarker).toBe(true);
    const msgs = store.messages.filter((m) => m.direction !== 'system');
    expect(msgs).toHaveLength(14);
    expect(msgs.map((m) => m.kind)).toEqual([
      'text', 'text', 'text', 'voice', 'text', 'text', 'text', 'image', 'document', 'text', 'deleted', 'sticker', 'text', 'text',
    ]);
    const at = (i: number) => msgs[i]!;
    const first = at(0), second = at(1), voice = at(3), ok1 = at(4), ok2 = at(5), quoted = at(6);
    const image = at(7), doc = at(8), link = at(9), deleted = at(10), fwd = at(12), trunc = at(13);
    expect(first).toMatchObject({ direction: 'in', sender: 'Cliente Ficticio SL', text: 'Hola, necesitamos automatizar la gestión de facturas.' });
    expect(first.when).toMatchObject({ date: '2026-10-25', time: '10:34', source: 'exact' });
    expect(second).toMatchObject({ direction: 'out', sender: 'Agente Demo' });
    expect(voice.when).toMatchObject({ date: '2026-10-25', time: '10:39', source: 'separator' });
    expect(ok1!.text).toBe('Ok');
    expect(ok2!.text).toBe('Ok');
    expect(ok1!.key).not.toBe(ok2!.key);
    expect(quoted!.text).toBe('Multilínea:\nuno\ndos 😀🎉');
    expect(quoted!.quote).toEqual({ sender: 'Cliente Ficticio SL', text: 'Unas 300.' });
    expect(image).toMatchObject({ kind: 'image', text: 'Así es la factura actual' });
    expect(doc).toMatchObject({ kind: 'document', mediaLabel: 'factura-octubre.pdf' });
    expect(link).toMatchObject({ text: 'Mira https://example.com/demo', edited: true });
    expect(link!.when.date).toBe('2026-11-01');
    expect(deleted).toMatchObject({ kind: 'deleted', text: '' });
    expect(fwd).toMatchObject({ forwarded: true });
    expect(fwd!.when.date).toBe(TODAY);
    expect(trunc).toMatchObject({ truncated: true, text: 'Texto muy largo que WhatsApp recorta' });
  });

  it('no mete texto de botones ni del citado en el cuerpo', () => {
    const { store } = extractFromSim(individualChat(richConversation()));
    for (const m of store.messages) {
      expect(m.text).not.toContain('Leer más');
      if (m.quote) expect(m.text).not.toContain(m.quote.text);
    }
  });

  it('grupos: nombres de participantes y el avatar no se toma por multimedia', () => {
    const items = [
      { fromMe: false, sender: 'Laura (Ficticia)', participant: '34611111111@c.us', date: TODAY, time: '10:00', text: 'Hola equipo' },
      { fromMe: false, participant: '34611111111@c.us', date: TODAY, time: '10:01', kind: 'voice' as const },
      { fromMe: false, sender: 'Pedro (Ficticio)', participant: '34622222222@c.us', date: TODAY, time: '10:02', text: 'Buenas' },
      { fromMe: false, participant: '34633333333@c.us', date: TODAY, time: '10:03', kind: 'image' as const },
      { fromMe: true, date: TODAY, time: '10:04', text: 'Os paso el resumen' },
    ];
    const { store } = extractFromSim(groupChat(items));
    expect(store.chat.isGroup).toBe(true);
    const msgs = store.messages.filter((m) => m.direction !== 'system');
    expect(msgs.map((m) => [m.kind, m.sender, m.senderKnown])).toEqual([
      ['text', 'Laura (Ficticia)', true],
      ['voice', 'Laura (Ficticia)', true],
      ['text', 'Pedro (Ficticio)', true],
      ['image', null, false],
      ['text', 'Agente Demo', true],
    ]);
  });

  it('formato inglés 12 h y MDY', () => {
    const items = [
      { fromMe: false, date: '2026-10-25', time: '21:05', text: 'Evening' },
      { fromMe: true, date: '2026-10-26', time: '08:00', text: 'Morning' },
    ];
    const { store } = extractFromSim(individualChat(items, { dateFormat: 'MDY', timeFormat: '12' }));
    const msgs = store.messages.filter((m) => m.direction !== 'system');
    expect(msgs[0]!.when).toMatchObject({ date: '2026-10-25', time: '21:05', dateAssumed: false });
    expect(msgs[1]!.when).toMatchObject({ date: '2026-10-26', time: '08:00' });
  });

  it('descarta filas de otro chat y omite banners de no leídos', () => {
    const { doc } = simDom(individualChat(richConversation(), { unreadBanner: true }));
    const foreign = doc.querySelector('[data-id]')!.cloneNode(true) as Element;
    foreign.setAttribute('data-id', 'false_34699999999@c.us_3EBFOREIGN');
    doc.querySelector('[role="application"]')!.append(foreign);
    const snap = readSnapshot(doc, NOW);
    expect(snap.foreignDropped).toBe(1);
    expect(snap.raws.some((r) => r.text.includes('NO LEÍDOS'))).toBe(false);
  });

  it('detecta el botón de sincronizar con el teléfono', () => {
    const { doc } = simDom(individualChat(richConversation(), { topBehavior: 'phone-sync' }));
    const snap = readSnapshot(doc, NOW);
    expect(snap.phoneSync).toBe(true);
    expect(snap.startMarker).toBe(false);
  });

  it('filas sin data-id reciben huella y no se pierden', () => {
    const items = [
      { id: null, fromMe: false, date: TODAY, time: '10:00', text: 'Sin id' },
      { id: null, fromMe: false, date: TODAY, time: '10:00', text: 'Sin id' },
      { fromMe: true, date: TODAY, time: '10:01', text: 'Con id' },
    ];
    const { store } = extractFromSim(individualChat(items));
    const msgs = store.messages.filter((m) => m.direction !== 'system');
    expect(msgs).toHaveLength(3);
    expect(msgs[0]!.idSource).toBe('fingerprint');
    expect(msgs[0]!.key).not.toBe(msgs[1]!.key);
    expect(msgs[0]!.sender).toBe('Cliente Ficticio SL');
  });

  it('el diagnóstico no contiene texto de mensajes', () => {
    const { doc } = simDom(individualChat(richConversation()));
    const diag = JSON.stringify(collectDiagnostics(doc));
    expect(diag).not.toContain('facturas');
    expect(diag).not.toContain('Cliente Ficticio');
    expect(JSON.parse(diag)).toMatchObject({ mainFound: true, messageElements: 14, scrollContainerFound: true });
  });
});
