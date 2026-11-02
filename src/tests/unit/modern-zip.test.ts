import { describe, expect, it } from 'vitest';
import { countDomMessages, readSnapshot } from '../../adapters/whatsapp/dom';
import { ConversationStore } from '../../content/conversationStore';
import { buildExportDocument } from '../../export/document';
import { buildZip, crc32 } from '../../export/zip';
import { buildZipBundle, mediaExtension } from '../../export/zipBundle';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { installModernSim } from '../fixtures/waModern';
import { readZip } from '../fixtures/zipReader';
import { blankDom } from './helpers';

const NOW = new Date(2026, 10, 2, 12, 0, 0);

function modern() {
  const dom = blankDom();
  installModernSim({ realMedia: false }, dom.window.document);
  const doc = dom.window.document;
  const snap = readSnapshot(doc, NOW);
  if (!snap.chat) throw new Error('sin chat');
  const store = new ConversationStore(snap.chat);
  store.ingest(snap, NOW, 'es', 'newer');
  return { doc, snap, store };
}

describe('DOM actual de WhatsApp Web (ids opacos, sin clases message-in/out)', () => {
  it('lee todos los mensajes con dirección, tipo, fecha y hora', () => {
    const { doc, snap, store } = modern();
    expect(snap.chat).toEqual({ key: 'title:Cliente Moderno SL', keySource: 'title', name: 'Cliente Moderno SL', isGroup: false });
    expect(countDomMessages(doc)).toBe(7);
    const msgs = store.messages;
    expect(msgs).toHaveLength(7);
    expect(msgs.map((m) => m.direction)).toEqual(['in', 'out', 'in', 'in', 'out', 'in', 'in']);
    expect(msgs.map((m) => m.kind)).toEqual(['text', 'text', 'image', 'voice', 'video', 'text', 'document']);
    expect(msgs.map((m) => m.when.date)).toEqual(Array(7).fill('2026-10-25'));
    expect(msgs.map((m) => m.when.time)).toEqual(['10:00', '10:01', '10:02', '10:03', '10:04', '10:05', '10:06']);
    expect(msgs[0]).toMatchObject({ sender: 'Cliente Moderno', text: 'Hola, os paso la factura', idSource: 'dom-id' });
    expect(msgs[1]).toMatchObject({ sender: 'Agente Demo', text: 'Recibido, gracias' });
    expect(msgs[3]!.when.source).toBe('separator');
    expect(msgs[6]).toMatchObject({ kind: 'document', mediaLabel: 'presupuesto-octubre.pdf', text: '' });
    // Ningún nombre de icono se cuela en el texto.
    expect(msgs.some((m) => /ic-|tail-/.test(m.text))).toBe(false);
  });

  it('recoge el aviso de historial que solo está en el teléfono', () => {
    const { snap, store } = modern();
    expect(snap.phoneSync).toBe(true);
    expect(snap.phoneSyncNotice).toContain('anteriores al 1/10/2026');
    expect(store.warnings().join(' ')).toContain('anteriores al 1/10/2026');
  });
});

describe('ZIP para IA', () => {
  it('crea un ZIP válido con nombres UTF-8 y CRC correctos', async () => {
    const zip = await buildZip([
      { path: 'LEEME.txt', data: 'Hola ñandú' },
      { path: 'media/0001_foto.jpg', data: new Uint8Array([1, 2, 3, 4]) },
    ]);
    const entries = readZip(new Uint8Array(await zip.arrayBuffer()));
    expect(entries.map((e) => e.path)).toEqual(['LEEME.txt', 'media/0001_foto.jpg']);
    expect(new TextDecoder().decode(entries[0]!.data)).toBe('Hola ñandú');
    expect(Array.from(entries[1]!.data)).toEqual([1, 2, 3, 4]);
    for (const e of entries) expect(e.crc).toBe(crc32(e.data));
  });

  it('rechaza rutas peligrosas o duplicadas', async () => {
    await expect(buildZip([{ path: '../fuera.txt', data: 'x' }])).rejects.toThrow();
    await expect(buildZip([{ path: '/abs.txt', data: 'x' }])).rejects.toThrow();
    await expect(buildZip([{ path: 'a.txt', data: 'x' }, { path: 'a.txt', data: 'y' }])).rejects.toThrow();
  });

  it('enlaza cada archivo con su mensaje y explica los que faltan', async () => {
    const { store } = modern();
    const doc = buildExportDocument(store.toSnapshot(7, 7, NOW.getTime()), { range: { mode: 'loaded' }, settings: DEFAULT_SETTINGS, now: NOW });
    const image = store.messages[2]!;
    const voice = store.messages[3]!;
    const video = store.messages[4]!;
    const pdf = store.messages[6]!;
    const media = new Map([
      [image.key, { kind: 'image' as const, blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }) }],
      [voice.key, { kind: 'audio' as const, blob: new Blob([new Uint8Array(5)], { type: 'audio/ogg; codecs=opus' }) }],
      [pdf.key, { kind: 'document' as const, blob: new Blob([new Uint8Array(7)], { type: 'application/pdf' }) }],
    ]);
    const failures = new Map([[video.key, 'WhatsApp no entregó el archivo a tiempo']]);
    const bundle = buildZipBundle(doc, media, failures, '1.1.0');
    expect(bundle.files).toBe(3);
    expect(bundle.missing).toBe(1);
    const paths = bundle.entries.map((e) => e.path);
    expect(paths).toEqual([
      'LEEME.txt',
      'PARA_LA_IA.txt',
      'conversacion.txt',
      'conversacion.json',
      'media/0003_2026-10-25_1002_cliente_foto.jpg',
      'media/0004_2026-10-25_1003_cliente_audio.ogg',
      'media/0007_2026-10-25_1006_cliente_documento_presupuesto-octubre.pdf',
    ]);
    const txt = bundle.entries.find((e) => e.path === 'conversacion.txt')!.data as string;
    expect(txt).toContain('[25/10/2026 10:02] CLIENTE:\n[IMAGEN]\n[ARCHIVO ADJUNTO EN EL ZIP: media/0003_2026-10-25_1002_cliente_foto.jpg]');
    expect(txt).toContain('[ARCHIVO ADJUNTO EN EL ZIP: media/0004_2026-10-25_1003_cliente_audio.ogg]');
    expect(txt).toContain('[25/10/2026 10:04] EMPRESA:\n[VÍDEO]\n[ARCHIVO NO INCLUIDO: WhatsApp no entregó el archivo a tiempo]');
    expect(txt).toContain('1 archivos multimedia no se pudieron incluir');
    expect(txt).toContain('[DOCUMENTO: presupuesto-octubre.pdf]\n[ARCHIVO ADJUNTO EN EL ZIP: media/0007_2026-10-25_1006_cliente_documento_presupuesto-octubre.pdf]');
    const ai = bundle.entries.find((e) => e.path === 'PARA_LA_IA.txt')!.data as string;
    expect(ai).toContain('Analiza también las fotos, audios, vídeos y documentos adjuntos.');
    const json = JSON.parse(bundle.entries.find((e) => e.path === 'conversacion.json')!.data as string);
    expect(json.messages[2].media).toMatchObject({ file: 'media/0003_2026-10-25_1002_cliente_foto.jpg', missing: null });
    expect(json.messages[4].media.missing).toContain('no entregó');
    const zip = await buildZip(bundle.entries, NOW);
    expect(readZip(new Uint8Array(await zip.arrayBuffer()))).toHaveLength(7);
  });

  it('elige la extensión por el tipo real del archivo', () => {
    expect(mediaExtension('audio/ogg; codecs=opus', 'audio')).toBe('ogg');
    expect(mediaExtension('image/webp', 'image')).toBe('webp');
    expect(mediaExtension('video/mp4', 'video')).toBe('mp4');
    expect(mediaExtension('', 'audio')).toBe('ogg');
    expect(mediaExtension('application/pdf', 'document')).toBe('pdf');
    expect(mediaExtension('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'document')).toBe('xlsx');
  });
});
