/** Generadores de conversaciones ficticias para pruebas. Ningún dato es real. */
import type { SimConfig, SimItem, SimMessage } from './waSim';

export const TODAY = '2026-11-02';
export const NOW = new Date(2026, 10, 2, 12, 0, 0);

const PHRASES = [
  'Hola, necesitamos automatizar la gestión de facturas.',
  'Perfecto. ¿Cuántas gestionáis mensualmente?',
  'Unas 300.',
  'Ok',
  'Te paso el presupuesto mañana 👍',
  '¿Podemos hablar a las 10:30?',
  'Gracias!',
  'Revisa este enlace: https://example.com/propuesta?id=42',
  'Línea uno\nLínea dos\nLínea tres',
  'Ñandú, acción, pingüino — “comillas” y € 1.200,50',
];

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** N mensajes repartidos en días consecutivos que terminan hoy, alternando remitente. */
export function generateMessages(n: number, opts: { perDay?: number; seed?: number } = {}): SimMessage[] {
  const perDay = opts.perDay ?? 12;
  const days = Math.ceil(n / perDay);
  const out: SimMessage[] = [];
  for (let i = 0; i < n; i++) {
    const day = Math.floor(i / perDay);
    const minute = (i % perDay) * 4;
    const hh = 9 + Math.floor(minute / 60);
    const mm = minute % 60;
    out.push({
      fromMe: i % 3 === 1,
      date: addDays(TODAY, day - days + 1),
      time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      text: `${PHRASES[(i + (opts.seed ?? 0)) % PHRASES.length]} #${i + 1}`,
    });
  }
  return out;
}

export function individualChat(items: SimItem[], extra: Partial<SimConfig> = {}): SimConfig {
  return {
    chatName: 'Cliente Ficticio SL',
    chatJid: '34600000001@c.us',
    items,
    today: TODAY,
    initialWindow: items.length,
    ...extra,
  };
}

export function groupChat(items: SimItem[], extra: Partial<SimConfig> = {}): SimConfig {
  return {
    chatName: 'Proyecto Demo — Grupo',
    chatJid: '120363000000000001@g.us',
    items,
    today: TODAY,
    initialWindow: items.length,
    ...extra,
  };
}

/** Conversación con todos los casos especiales. */
export function richConversation(): SimItem[] {
  const d = addDays(TODAY, -1);
  return [
    { fromMe: false, date: '2026-10-25', time: '10:34', text: 'Hola, necesitamos automatizar la gestión de facturas.' },
    { fromMe: true, date: '2026-10-25', time: '10:36', text: 'Perfecto. ¿Cuántas gestionáis mensualmente?' },
    { fromMe: false, date: '2026-10-25', time: '10:38', text: 'Unas 300.' },
    { fromMe: false, date: '2026-10-25', time: '10:39', kind: 'voice' },
    { fromMe: false, date: '2026-10-25', time: '10:40', text: 'Ok' },
    { fromMe: false, date: '2026-10-25', time: '10:40', text: 'Ok' },
    { fromMe: true, date: '2026-10-25', time: '10:41', text: 'Multilínea:\nuno\ndos 😀🎉', quote: { sender: 'Cliente Ficticio SL', text: 'Unas 300.' } },
    { fromMe: false, date: '2026-10-25', time: '10:42', kind: 'image', text: 'Así es la factura actual' },
    { fromMe: false, date: '2026-10-25', time: '10:43', kind: 'document', fileName: 'factura-octubre.pdf' },
    { fromMe: true, date: d, time: '18:05', text: 'Mira https://example.com/demo', edited: true },
    { fromMe: false, date: d, time: '18:07', kind: 'deleted' },
    { fromMe: false, date: d, time: '18:09', kind: 'sticker' },
    { fromMe: true, date: TODAY, time: '09:00', text: 'Reenvío la propuesta', forwarded: true },
    { fromMe: false, date: TODAY, time: '09:15', text: 'Texto muy largo que WhatsApp recorta', truncated: true },
  ];
}
