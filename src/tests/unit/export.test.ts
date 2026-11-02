import { describe, expect, it } from 'vitest';
import type { ConversationSnapshot, Message, RangeSelection } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { buildExportDocument } from '../../export/document';
import { formatTxt, formatHeader, formatMessageBlocks } from '../../export/txt';
import { escapeMarkdownLine, formatMarkdown } from '../../export/markdown';
import { buildJson, JSON_SCHEMA_VERSION } from '../../export/json';
import { AI_INSTRUCTIONS, formatForAi } from '../../export/aiPrompt';
import { CONTINUES, splitIntoBlocks } from '../../export/blocks';
import { exportFilename, safeSlug } from '../../export/filename';
import { applyRange } from '../../export/range';
import { extractFromSim } from './helpers';
import { individualChat, NOW, richConversation } from '../fixtures/generators';

function snapshotFrom(messages: Message[], extra: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    chat: { key: '34600000001@c.us', keySource: 'jid', name: 'Cliente Ficticio SL', isGroup: false },
    messages,
    coverage: 'loaded-only',
    startReached: false,
    historyAttempted: false,
    gapSuspected: false,
    warnings: [],
    domCount: messages.length,
    storedCount: 0,
    extractedAt: NOW.getTime(),
    ...extra,
  };
}

function m(i: number, date: string | null, time: string | null, text: string, extra: Partial<Message> = {}): Message {
  return {
    key: `id:${i}`,
    idSource: 'dom-id',
    chatKey: '34600000001@c.us',
    direction: i % 2 ? 'out' : 'in',
    sender: i % 2 ? 'Agente Demo' : 'Cliente Ficticio SL',
    senderKnown: true,
    when: { date, time, source: date && time ? 'exact' : time ? 'time-only' : 'none', dateAssumed: false, rawDate: date },
    kind: 'text',
    text,
    quote: null,
    mediaLabel: null,
    edited: false,
    forwarded: false,
    truncated: false,
    ...extra,
  };
}

const loaded: RangeSelection = { mode: 'loaded' };

describe('TXT', () => {
  it('produce exactamente el formato pedido', () => {
    const snap = snapshotFrom([
      m(0, '2026-10-25', '10:34', 'Hola, necesitamos automatizar la gestión de facturas.'),
      m(1, '2026-10-25', '10:36', 'Perfecto. ¿Cuántas gestionáis mensualmente?'),
      m(2, '2026-10-25', '10:38', 'Unas 300.'),
      m(4, '2026-10-25', '10:39', '', { kind: 'voice' }),
    ]);
    const txt = formatTxt(buildExportDocument(snap, { range: loaded, settings: DEFAULT_SETTINGS, now: NOW }));
    expect(txt.startsWith('CONVERSACIÓN: Cliente Ficticio SL\nEXPORTADO: 02/11/2026 12:00\nMENSAJES RECUPERADOS: 4\nRANGO: 25/10/2026 10:34 - 25/10/2026 10:39\nCOBERTURA: Solo mensajes cargados\n')).toBe(true);
    expect(txt).toContain('ADVERTENCIAS:\n- Solo se incluyen los mensajes cargados');
    expect(txt).toContain(
      '[25/10/2026 10:34] CLIENTE:\nHola, necesitamos automatizar la gestión de facturas.\n\n[25/10/2026 10:36] EMPRESA:\nPerfecto. ¿Cuántas gestionáis mensualmente?\n\n[25/10/2026 10:38] CLIENTE:\nUnas 300.\n\n[25/10/2026 10:39] CLIENTE:\n[AUDIO: transcripción no disponible]\n',
    );
  });

  it('usa indicadores para valores ausentes y no los inventa', () => {
    const snap = snapshotFrom([
      m(0, null, '10:00', 'sin fecha'),
      m(2, null, null, 'nada'),
      m(4, '2026-10-25', null, 'sin hora'),
      m(6, '2026-10-25', '11:00', 'grupo', { sender: null, senderKnown: false }),
    ]);
    snap.chat.isGroup = true;
    const txt = formatTxt(buildExportDocument(snap, { range: loaded, settings: DEFAULT_SETTINGS, now: NOW }));
    expect(txt).toContain('[FECHA NO DISPONIBLE 10:00] Cliente Ficticio SL:\nsin fecha');
    expect(txt).toContain('[FECHA NO DISPONIBLE] Cliente Ficticio SL:\nnada');
    expect(txt).toContain('[25/10/2026 · HORA NO DISPONIBLE] Cliente Ficticio SL:\nsin hora');
    expect(txt).toContain('[25/10/2026 11:00] REMITENTE DESCONOCIDO:\ngrupo');
    expect(txt).toContain('mensajes sin fecha disponible (FECHA NO DISPONIBLE)');
  });

  it('conversación rica extraída del DOM simulado', () => {
    const { store } = extractFromSim(individualChat(richConversation()));
    const snap = store.toSnapshot(14, 0, NOW.getTime());
    const txt = formatTxt(buildExportDocument(snap, { range: loaded, settings: DEFAULT_SETTINGS, now: NOW }));
    expect(snap.coverage).toBe('start-reached');
    expect(txt).toContain('COBERTURA: Inicio aparente alcanzado');
    expect(txt).toContain('[25/10/2026 10:41] EMPRESA:\n> Respondiendo a CLIENTE: Unas 300.\nMultilínea:\nuno\ndos 😀🎉');
    expect(txt).toContain('[25/10/2026 10:42] CLIENTE:\n[IMAGEN]\nAsí es la factura actual');
    expect(txt).toContain('[DOCUMENTO: factura-octubre.pdf]');
    expect(txt).toContain('[01/11/2026 18:05] EMPRESA: (editado)\nMira https://example.com/demo');
    expect(txt).toContain('[MENSAJE ELIMINADO]');
    expect(txt).toContain('[STICKER]');
    expect(txt).toContain('[Reenviado]\nReenvío la propuesta');
    expect(txt).toContain('[TEXTO RECORTADO POR WHATSAPP');
    expect(txt.match(/\] CLIENTE:\nOk\n/g)).toHaveLength(2);
  });

  it('modo nombres', () => {
    const snap = snapshotFrom([m(0, '2026-10-25', '10:00', 'a'), m(1, '2026-10-25', '10:01', 'b')]);
    const txt = formatTxt(buildExportDocument(snap, { range: loaded, settings: { ...DEFAULT_SETTINGS, senderLabels: 'names' }, now: NOW }));
    expect(txt).toContain('] Cliente Ficticio SL:\na');
    expect(txt).toContain('] Agente Demo (EMPRESA):\nb');
  });
});

describe('rangos', () => {
  const msgs = [
    m(0, '2026-09-01', '10:00', 'viejo'),
    m(1, '2026-10-20', '10:00', 'hace 13 días'),
    m(2, null, '10:05', 'sin fecha entre dos fuera'),
    m(3, '2026-10-28', '10:00', 'hace 5 días'),
    m(4, null, '10:06', 'sin fecha entre dos dentro'),
    m(5, '2026-11-02', '10:00', 'hoy'),
  ];
  it('últimos 7 días incluye solo lo que cae dentro y los sin fecha entre fechas internas', () => {
    const r = applyRange(msgs, { mode: 'last7' }, NOW, false);
    expect(r.messages.map((x) => x.text)).toEqual(['hace 5 días', 'sin fecha entre dos dentro', 'hoy']);
    expect(r.excludedUndated).toBe(1);
    expect(r.coveredByEvidence).toBe(true);
  });
  it('últimos 30 días', () => {
    expect(applyRange(msgs, { mode: 'last30' }, NOW, false).messages).toHaveLength(5);
  });
  it('fechas personalizadas (se ordenan si vienen al revés)', () => {
    const r = applyRange(msgs, { mode: 'custom', from: '2026-10-28', to: '2026-10-01' }, NOW, false);
    expect(r.bounds).toEqual({ from: '2026-10-01', to: '2026-10-28' });
    expect(r.messages.map((x) => x.text)).toEqual(['hace 13 días', 'sin fecha entre dos fuera', 'hace 5 días']);
  });
  it('sin evidencia de cobertura avisa', () => {
    const snap = snapshotFrom(msgs.slice(3));
    const doc = buildExportDocument(snap, { range: { mode: 'last30' }, settings: DEFAULT_SETTINGS, now: NOW });
    expect(doc.warnings.join(' ')).toContain('No hay evidencia de que se hayan capturado todos los mensajes desde el 04/10/2026');
  });
});

describe('Markdown y JSON', () => {
  it('Markdown neutraliza HTML y sintaxis al inicio de línea', () => {
    expect(escapeMarkdownLine('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeMarkdownLine('# título')).toBe('\\# título');
    const snap = snapshotFrom([m(0, '2026-10-25', '10:00', '<img src=x onerror=alert(1)>\n# no es título')]);
    const md = formatMarkdown(buildExportDocument(snap, { range: loaded, settings: DEFAULT_SETTINGS, now: NOW }));
    expect(md).not.toContain('<img');
    expect(md).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(md).toContain('\\# no es título');
  });

  it('JSON con esquema versionado y campos completos', () => {
    const snap = snapshotFrom([m(0, '2026-10-25', '10:00', 'hola', { quote: { sender: 'Tú', text: 'x' } }), m(1, '2026-10-25', '10:01', '', { kind: 'voice' })]);
    const json = buildJson(buildExportDocument(snap, { range: loaded, settings: DEFAULT_SETTINGS, now: NOW }), '1.0.0');
    expect(json.schemaVersion).toBe(JSON_SCHEMA_VERSION);
    expect(json.chat).toEqual({ name: 'Cliente Ficticio SL', isGroup: false });
    expect(json.messages[0]).toMatchObject({ index: 0, direction: 'in', senderLabel: 'CLIENTE', date: '2026-10-25', time: '10:00', type: 'text', quote: { sender: 'Tú', text: 'x' } });
    expect(json.messages[1]).toMatchObject({ type: 'voice', media: { label: null, transcription: null } });
    expect(json.participants).toEqual([
      { label: 'CLIENTE', direction: 'in', messages: 1 },
      { label: 'EMPRESA', direction: 'out', messages: 1 },
    ]);
    expect(JSON.stringify(json)).not.toContain('34600000001');
  });
});

describe('Copiar para IA', () => {
  it('incluye instrucciones, aviso de cobertura y la conversación', () => {
    const snap = snapshotFrom([m(0, '2026-10-25', '10:00', 'hola')]);
    const text = formatForAi(buildExportDocument(snap, { range: loaded, settings: DEFAULT_SETTINGS, now: NOW }));
    expect(text.startsWith(AI_INSTRUCTIONS)).toBe(true);
    expect(text).toContain('18. Briefing para el equipo técnico.');
    expect(text).toContain('Separa HECHOS CONFIRMADOS, PROPUESTAS, HIPÓTESIS y PENDIENTES.');
    expect(text).toContain('AVISO DE COBERTURA: Solo mensajes cargados');
    expect(text).toContain('[25/10/2026 10:00] CLIENTE:\nhola');
  });
});

describe('bloques numerados', () => {
  it('parte sin perder texto ni cortar mensajes salvo los gigantes', () => {
    const msgs = Array.from({ length: 500 }, (_, i) => m(i, '2026-10-25', '10:00', `Mensaje ${i} `.repeat(20)));
    const doc = buildExportDocument(snapshotFrom(msgs), { range: loaded, settings: DEFAULT_SETTINGS, now: NOW });
    const units = formatMessageBlocks(doc);
    const blocks = splitIntoBlocks(formatHeader(doc).join('\n'), units, 20_000, 'Cliente Ficticio SL');
    expect(blocks.length).toBeGreaterThan(3);
    blocks.forEach((b, i) => {
      expect(b.index).toBe(i + 1);
      expect(b.total).toBe(blocks.length);
      expect(b.text.length).toBeLessThan(21_000);
    });
    for (const u of units) expect(blocks.some((b) => b.text.includes(u))).toBe(true);
  });
  it('un mensaje enorme se trocea con marca de continuación', () => {
    const blocks = splitIntoBlocks('CABECERA', ['x'.repeat(5000)], 1000, 'Chat');
    const joined = blocks.map((b) => b.text.replace(/^=== PARTE.*\n\n/, '').replace(/\n\n=== FIN PARTE.*\n$/, '').replace(`\n${CONTINUES}`, '')).join('');
    expect(joined.replace('CABECERA', '')).toBe('x'.repeat(5000));
  });
});

describe('nombres de archivo', () => {
  it('seguros y descriptivos', () => {
    expect(safeSlug('Clínica Ñandú / "Test" <script>')).toBe('clinica-nandu-test-script');
    expect(safeSlug('😀😀')).toBe('conversacion');
    expect(exportFilename('Cliente Ficticio SL', NOW, 'json')).toBe('whatsapp_cliente-ficticio-sl_2026-11-02_1200.json');
  });
});
