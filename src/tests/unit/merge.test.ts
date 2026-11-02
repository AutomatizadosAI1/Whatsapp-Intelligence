import { describe, expect, it } from 'vitest';
import type { Message } from '../../shared/types';
import { chronologyInversions, mergeMessages, preferRicher } from '../../deduplication/merge';
import { assignFingerprints } from '../../normalization/normalize';

function msg(key: string, text = key, extra: Partial<Message> = {}): Message {
  return {
    key,
    idSource: key.startsWith('fp') || key === '' ? 'fingerprint' : 'dom-id',
    chatKey: 'chat@c.us',
    direction: 'in',
    sender: 'Cliente',
    senderKnown: true,
    when: { date: '2026-10-25', time: '10:00', source: 'exact', dateAssumed: false, rawDate: '25/10/2026' },
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

const seq = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => msg(`id:m${from + i}`, `texto ${from + i}`));

describe('mergeMessages', () => {
  it('añade lotes más antiguos solapados sin duplicar', () => {
    let store = mergeMessages([], seq(60, 100), 'newer').messages;
    store = mergeMessages(store, seq(30, 80), 'older').messages;
    store = mergeMessages(store, seq(0, 45), 'older').messages;
    expect(store.map((m) => m.key)).toEqual(seq(0, 100).map((m) => m.key));
  });

  it('reconstruye la secuencia completa con ventanas virtualizadas en orden aleatorio solapado', () => {
    const full = seq(0, 1000);
    let store: Message[] = [];
    let end = 1000;
    let rnd = 42;
    const random = () => ((rnd = (rnd * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    store = mergeMessages(store, full.slice(940, 1000), 'newer').messages;
    let start = 940;
    while (start > 0) {
      const step = 10 + Math.floor(random() * 50);
      const newStart = Math.max(0, start - step);
      end = Math.min(1000, newStart + step + 5 + Math.floor(random() * 80));
      store = mergeMessages(store, full.slice(newStart, end), 'older').messages;
      start = newStart;
    }
    expect(store).toHaveLength(1000);
    expect(store.map((m) => m.key)).toEqual(full.map((m) => m.key));
  });

  it('inserta mensajes nuevos entre anclas conocidas', () => {
    const store = [msg('id:a'), msg('id:c')];
    const r = mergeMessages(store, [msg('id:a'), msg('id:b'), msg('id:c')], 'newer');
    expect(r.messages.map((m) => m.key)).toEqual(['id:a', 'id:b', 'id:c']);
    expect(r.added).toBe(1);
  });

  it('textos idénticos con ids distintos se conservan', () => {
    const r = mergeMessages([], [msg('id:x1', 'Ok'), msg('id:x2', 'Ok'), msg('id:x3', 'Ok')], 'newer');
    expect(r.messages).toHaveLength(3);
  });

  it('huellas: dos "Ok" seguidos sin id son dos mensajes, y releerlos no duplica', () => {
    const batch = () => {
      const list = [msg('id:a', 'antes'), msg('', 'Ok'), msg('', 'Ok'), msg('id:b', 'después')];
      assignFingerprints(list);
      return list;
    };
    const first = batch();
    expect(first[1]!.key).not.toBe(first[2]!.key);
    let store = mergeMessages([], first, 'newer').messages;
    store = mergeMessages(store, batch(), 'newer').messages;
    expect(store).toHaveLength(4);
  });

  it('huellas con ancla distinta se emparejan por contenido cerca de su posición', () => {
    const a = [msg('', 'Aviso del sistema'), msg('id:b', 'b'), msg('id:c', 'c')];
    assignFingerprints(a); // ancla "n:id:b"
    const b = [msg('id:a0', 'a0'), msg('', 'Aviso del sistema'), msg('id:b', 'b')];
    assignFingerprints(b); // ancla "id:a0"
    expect(a[0]!.key).not.toBe(b[1]!.key);
    let store = mergeMessages([], a, 'newer').messages;
    store = mergeMessages(store, b, 'older').messages;
    expect(store.map((m) => m.text)).toEqual(['a0', 'Aviso del sistema', 'b', 'c']);
  });

  it('marca hueco si el lote no enlaza con lo guardado', () => {
    const r = mergeMessages(seq(50, 60), seq(0, 10), 'older');
    expect(r.disjoint).toBe(true);
    expect(r.messages[0]!.key).toBe('id:m0');
    expect(r.messages).toHaveLength(20);
  });

  it('nunca elimina mensajes al fusionar', () => {
    const store = seq(0, 20);
    const r = mergeMessages(store, seq(5, 15), 'older');
    expect(r.messages).toHaveLength(20);
    expect(r.added).toBe(0);
  });
});

describe('preferRicher', () => {
  it('prefiere timestamp exacto, remitente conocido y texto no recortado', () => {
    const a = msg('id:z', 'corto', { truncated: true, sender: null, senderKnown: false, when: { date: null, time: '10:00', source: 'time-only', dateAssumed: false, rawDate: null } });
    const b = msg('id:z', 'corto y completo');
    const r = preferRicher(a, b);
    expect(r.text).toBe('corto y completo');
    expect(r.truncated).toBe(false);
    expect(r.sender).toBe('Cliente');
    expect(r.when.source).toBe('exact');
  });
});

describe('chronologyInversions', () => {
  it('cuenta saltos atrás entre timestamps exactos', () => {
    const t = (time: string) => msg(`id:${time}`, time, { when: { date: '2026-10-25', time, source: 'exact', dateAssumed: false, rawDate: null } });
    expect(chronologyInversions([t('10:00'), t('10:05'), t('09:00'), t('11:00')])).toBe(1);
  });
});
