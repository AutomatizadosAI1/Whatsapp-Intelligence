/**
 * Parseo de fechas y horas tal y como las muestra WhatsApp Web.
 * Funciones puras: nunca inventan componentes; si algo es ambiguo lo marcan.
 */

export type DateOrder = 'DMY' | 'MDY';

export interface DateParts {
  /** Primer número (día en DMY, mes en MDY). */
  a: number;
  b: number;
  year: number;
  /** True si el texto era AAAA-MM-DD (no ambiguo). */
  iso: boolean;
  /** True si el año venía con dos cifras. */
  shortYear: boolean;
}

const BIDI_AND_SPACES = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Elimina marcas de dirección Unicode y normaliza espacios duros. */
export function cleanVisibleText(value: string): string {
  return value.replace(BIDI_AND_SPACES, '').replace(/[\u00a0\u202f\u2007]/g, ' ');
}

const TIME_RE = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm)?$/i;

/** "10:34", "9:05 p. m.", "10:34 AM" -> "HH:MM" (24 h) o null. */
export function parseTime(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = TIME_RE.exec(cleanVisibleText(input).trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const suffix = m[4]?.toLowerCase().replace(/[\s.]/g, '');
  if (min > 59) return null;
  if (suffix) {
    if (h < 1 || h > 12) return null;
    if (suffix === 'pm' && h !== 12) h += 12;
    if (suffix === 'am' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function looksLikeTime(input: string): boolean {
  return parseTime(input) !== null;
}

/** "25/10/2026", "10/25/26", "25.10.2026", "2026-10-25" -> partes sin interpretar. */
export function parseDateParts(input: string | null | undefined): DateParts | null {
  if (!input) return null;
  const s = cleanVisibleText(input).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return { a: Number(m[3]), b: Number(m[2]), year: Number(m[1]), iso: true, shortYear: false };
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3]!;
    return {
      a: Number(m[1]),
      b: Number(m[2]),
      year: y.length === 2 ? 2000 + Number(y) : Number(y),
      iso: false,
      shortYear: y.length === 2,
    };
  }
  return null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 2009 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Convierte partes a AAAA-MM-DD con un orden concreto. */
export function partsToIso(parts: DateParts, order: DateOrder): string | null {
  if (parts.iso) return isoDate(parts.year, parts.b, parts.a);
  return order === 'DMY' ? isoDate(parts.year, parts.b, parts.a) : isoDate(parts.year, parts.a, parts.b);
}

const MDY_LOCALES = ['en-us', 'en-ph', 'fil', 'en'];

/** Orden por defecto según el idioma de la página; solo se usa si los datos no lo resuelven. */
export function localeDateOrder(locale: string | null | undefined): DateOrder {
  const l = (locale ?? '').toLowerCase();
  return MDY_LOCALES.includes(l) ? 'MDY' : 'DMY';
}

export interface DateOrderInference {
  order: DateOrder;
  /** True si no hubo evidencia en las fechas y se usó el idioma. */
  assumed: boolean;
}

/**
 * Deduce el orden día/mes a partir de todas las fechas de la conversación.
 * Si algún primer número supera 12 es DMY; si lo supera el segundo, MDY.
 */
export function inferDateOrder(samples: DateParts[], locale: string | null | undefined): DateOrderInference {
  let dmy = false;
  let mdy = false;
  for (const p of samples) {
    if (p.iso) continue;
    if (p.a > 12 && p.b <= 12) dmy = true;
    if (p.b > 12 && p.a <= 12) mdy = true;
  }
  if (dmy && !mdy) return { order: 'DMY', assumed: false };
  if (mdy && !dmy) return { order: 'MDY', assumed: false };
  return { order: localeDateOrder(locale), assumed: true };
}

export interface PrePlainParts {
  time: string | null;
  dateText: string | null;
  sender: string | null;
}

/**
 * Parsea el atributo de copia de WhatsApp: "[10:34, 25/10/2026] Nombre: ".
 * Acepta la hora delante o detrás de la fecha y horas de 12 h.
 */
export function parsePrePlainText(input: string | null | undefined): PrePlainParts | null {
  if (!input) return null;
  const s = cleanVisibleText(input);
  const m = /^\s*\[([^\]]+)\]\s*([\s\S]*?)\s*$/.exec(s);
  if (!m) return null;
  const inside = m[1]!.split(/,\s*/);
  let time: string | null = null;
  let dateText: string | null = null;
  for (const part of inside) {
    const p = part.trim();
    if (!time && parseTime(p)) time = parseTime(p);
    else if (!dateText && parseDateParts(p)) dateText = p;
  }
  let sender: string | null = m[2] ?? '';
  sender = sender.replace(/:\s*$/, '').trim();
  if (!sender) sender = null;
  if (!time && !dateText) return null;
  return { time, dateText, sender };
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, 'miércoles': 3, miercoles: 3, jueves: 4, viernes: 5, 'sábado': 6, sabado: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  diumenge: 0, dilluns: 1, dimarts: 2, dimecres: 3, dijous: 4, divendres: 5, dissabte: 6,
};

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

const TODAY = new Set(['hoy', 'today', 'avui']);
const YESTERDAY = new Set(['ayer', 'yesterday', 'ahir']);

export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d + days);
  return localIsoDate(date);
}

export interface DayLabelResult {
  date: string | null;
  assumed: boolean;
}

/**
 * Interpreta el texto de un separador de día ("HOY", "AYER", "LUNES",
 * "25/10/2026", "25 de octubre de 2026"). Devuelve null si no es un separador.
 * Los relativos se resuelven igual que hace WhatsApp respecto a `now`.
 */
export function parseDayLabel(label: string, now: Date, order: DateOrder): DayLabelResult | null {
  const s = cleanVisibleText(label).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s || s.length > 40) return null;
  const today = localIsoDate(now);
  if (TODAY.has(s)) return { date: today, assumed: false };
  if (YESTERDAY.has(s)) return { date: addDays(today, -1), assumed: false };
  if (s in WEEKDAYS) {
    // WhatsApp usa el nombre del día para los días 2 a 6 anteriores a hoy.
    const target = WEEKDAYS[s]!;
    for (let back = 2; back <= 6; back++) {
      const iso = addDays(today, -back);
      const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
      if (new Date(y, m - 1, d).getDay() === target) return { date: iso, assumed: false };
    }
    return null;
  }
  const parts = parseDateParts(s);
  if (parts) {
    const iso = partsToIso(parts, order);
    return iso ? { date: iso, assumed: !parts.iso && parts.a <= 12 && parts.b <= 12 } : null;
  }
  // "25 de octubre de 2026", "25 octubre 2026", "october 25, 2026", "25 de octubre"
  let m = /^(\d{1,2})(?: de)? ([a-záéíóú]+)(?:,)?(?: de)?(?: (\d{4}))?$/.exec(s);
  let day: number | null = null;
  let monthName: string | null = null;
  let year: number | null = null;
  if (m) {
    day = Number(m[1]);
    monthName = m[2]!;
    year = m[3] ? Number(m[3]) : null;
  } else {
    m = /^([a-z]+) (\d{1,2}),?(?: (\d{4}))?$/.exec(s);
    if (m) {
      monthName = m[1]!;
      day = Number(m[2]);
      year = m[3] ? Number(m[3]) : null;
    }
  }
  if (day === null || !monthName || !(monthName in MONTHS)) return null;
  const month = MONTHS[monthName]!;
  if (year !== null) {
    const iso = isoDate(year, month, day);
    return iso ? { date: iso, assumed: false } : null;
  }
  // Sin año: WhatsApp lo omite para el año en curso. Se marca como deducido.
  const candidate = isoDate(now.getFullYear(), month, day);
  if (!candidate) return null;
  if (candidate <= today) return { date: candidate, assumed: true };
  const prev = isoDate(now.getFullYear() - 1, month, day);
  return prev ? { date: prev, assumed: true } : null;
}

export function isDayLabel(label: string, now: Date): boolean {
  return parseDayLabel(label, now, 'DMY') !== null;
}

/** AAAA-MM-DD -> DD/MM/AAAA para mostrar. */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function displayDateTime(d: Date): string {
  return `${displayDate(localIsoDate(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
