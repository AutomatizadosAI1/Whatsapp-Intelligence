/** Lector ZIP mínimo para las pruebas (solo método "store"): lee el directorio central. */
export interface ReadEntry {
  path: string;
  data: Uint8Array;
  crc: number;
}

export function readZip(buf: Uint8Array): ReadEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP sin directorio central');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out: ReadEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Entrada central inválida');
    const method = view.getUint16(p + 10, true);
    if (method !== 0) throw new Error('Método no soportado');
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const path = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const localName = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localName + localExtra;
    out.push({ path, data: buf.subarray(start, start + size), crc });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
