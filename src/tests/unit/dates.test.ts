import { describe, expect, it } from 'vitest';
import {
  addDays,
  inferDateOrder,
  parseDateParts,
  parseDayLabel,
  parsePrePlainText,
  parseTime,
  partsToIso,
} from '../../normalization/dates';

const NOW = new Date(2026, 10, 2, 12, 0); // lunes 2 nov 2026

describe('parseTime', () => {
  it.each([
    ['10:34', '10:34'],
    ['9:05', '09:05'],
    ['9:05 p. m.', '21:05'],
    ['12:10\u00a0a.\u00a0m.', '00:10'],
    ['12:10 PM', '12:10'],
    ['7:00 am', '07:00'],
    ['23:59', '23:59'],
  ])('%s -> %s', (input, expected) => expect(parseTime(input)).toBe(expected));

  it.each(['24:00', '13:00 pm', '10:60', 'hola', '', '0:42 min'])('rechaza %s', (input) => expect(parseTime(input)).toBeNull());
});

describe('parsePrePlainText', () => {
  it('formato español 24 h', () => {
    expect(parsePrePlainText('[10:34, 25/10/2026] Juan Pérez: ')).toEqual({ time: '10:34', dateText: '25/10/2026', sender: 'Juan Pérez' });
  });
  it('formato 12 h con espacios duros y marcas bidi', () => {
    expect(parsePrePlainText('[9:05\u00a0p.\u00a0m., 3/11/2026] \u200e+34 600 00 00 01: ')).toEqual({
      time: '21:05',
      dateText: '3/11/2026',
      sender: '+34 600 00 00 01',
    });
  });
  it('formato inglés EE. UU.', () => {
    expect(parsePrePlainText('[10:34 AM, 10/25/2026] John: ')).toEqual({ time: '10:34', dateText: '10/25/2026', sender: 'John' });
  });
  it('fecha antes que la hora', () => {
    expect(parsePrePlainText('[25.10.26, 10:34] Ana: ')).toEqual({ time: '10:34', dateText: '25.10.26', sender: 'Ana' });
  });
  it('nombre con dos puntos internos', () => {
    expect(parsePrePlainText('[10:34, 25/10/2026] Soporte: Ventas: ')?.sender).toBe('Soporte: Ventas');
  });
  it('devuelve null si no hay corchetes', () => {
    expect(parsePrePlainText('Juan: hola')).toBeNull();
    expect(parsePrePlainText(null)).toBeNull();
  });
});

describe('fechas y orden día/mes', () => {
  it('detecta DMY por un día > 12', () => {
    const parts = ['25/10/2026', '01/11/2026'].map((s) => parseDateParts(s)!);
    expect(inferDateOrder(parts, 'en-US')).toEqual({ order: 'DMY', assumed: false });
  });
  it('detecta MDY por un segundo número > 12', () => {
    const parts = ['10/25/2026', '11/01/2026'].map((s) => parseDateParts(s)!);
    expect(inferDateOrder(parts, 'es')).toEqual({ order: 'MDY', assumed: false });
  });
  it('si es ambiguo usa el idioma y lo marca como supuesto', () => {
    const parts = ['01/11/2026', '02/11/2026'].map((s) => parseDateParts(s)!);
    expect(inferDateOrder(parts, 'es')).toEqual({ order: 'DMY', assumed: true });
    expect(inferDateOrder(parts, 'en-US')).toEqual({ order: 'MDY', assumed: true });
  });
  it('año de dos cifras y validación de calendario', () => {
    expect(partsToIso(parseDateParts('29/02/24')!, 'DMY')).toBe('2024-02-29');
    expect(partsToIso(parseDateParts('29/02/2026')!, 'DMY')).toBeNull();
    expect(partsToIso(parseDateParts('2026-10-25')!, 'MDY')).toBe('2026-10-25');
  });
});

describe('separadores de día', () => {
  it('HOY / AYER / TODAY relativos a la fecha actual', () => {
    expect(parseDayLabel('HOY', NOW, 'DMY')?.date).toBe('2026-11-02');
    expect(parseDayLabel('Ayer', NOW, 'DMY')?.date).toBe('2026-11-01');
    expect(parseDayLabel('YESTERDAY', NOW, 'DMY')?.date).toBe('2026-11-01');
  });
  it('día de la semana dentro de los 6 días anteriores', () => {
    // 2/11/2026 es lunes: "JUEVES" = 29/10/2026
    expect(parseDayLabel('JUEVES', NOW, 'DMY')?.date).toBe('2026-10-29');
    expect(parseDayLabel('miércoles', NOW, 'DMY')?.date).toBe('2026-10-28');
  });
  it('fechas numéricas y textuales', () => {
    expect(parseDayLabel('25/10/2026', NOW, 'DMY')).toEqual({ date: '2026-10-25', assumed: false });
    expect(parseDayLabel('25 de octubre de 2026', NOW, 'DMY')).toEqual({ date: '2026-10-25', assumed: false });
    expect(parseDayLabel('October 25, 2026', NOW, 'DMY')).toEqual({ date: '2026-10-25', assumed: false });
  });
  it('fecha sin año se marca como deducida', () => {
    expect(parseDayLabel('25 de octubre', NOW, 'DMY')).toEqual({ date: '2026-10-25', assumed: true });
    expect(parseDayLabel('25 de diciembre', NOW, 'DMY')).toEqual({ date: '2025-12-25', assumed: true });
  });
  it('no confunde texto normal con separadores', () => {
    expect(parseDayLabel('Hola, ¿qué tal?', NOW, 'DMY')).toBeNull();
    expect(parseDayLabel('Los mensajes están cifrados de extremo a extremo', NOW, 'DMY')).toBeNull();
  });
  it('addDays cruza meses', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
});
