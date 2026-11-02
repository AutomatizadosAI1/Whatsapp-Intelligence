import type { ChatInfo, Message, SenderLabelMode } from '../shared/types';
import { displayDate } from '../normalization/dates';

export const UNKNOWN_SENDER = 'REMITENTE DESCONOCIDO';
export const NO_DATE = 'FECHA NO DISPONIBLE';
export const NO_TIME = 'HORA NO DISPONIBLE';

const SELF_QUOTE = /^(tú|tu|you|vos)$/i;

export function senderLabel(m: Message, chat: ChatInfo, mode: SenderLabelMode): string {
  if (m.direction === 'system') return 'SISTEMA';
  if (mode === 'roles') {
    if (m.direction === 'out') return 'EMPRESA';
    if (!chat.isGroup) return 'CLIENTE';
    return m.sender ?? UNKNOWN_SENDER;
  }
  if (m.direction === 'out') return m.sender ? `${m.sender} (EMPRESA)` : 'EMPRESA';
  return m.sender ?? UNKNOWN_SENDER;
}

export function quoteSenderLabel(sender: string | null, mode: SenderLabelMode, chat: ChatInfo): string {
  if (!sender) return 'mensaje anterior';
  if (SELF_QUOTE.test(sender)) return mode === 'roles' ? 'EMPRESA' : sender;
  if (mode === 'roles' && !chat.isGroup) return 'CLIENTE';
  return sender;
}

export function timestampLabel(m: Message): string {
  const { date, time, dateAssumed } = m.when;
  const d = date ? `${displayDate(date)}${dateAssumed ? ' (fecha deducida)' : ''}` : null;
  if (d && time) return `${d} ${time}`;
  if (d) return `${d} · ${NO_TIME}`;
  if (time) return `${NO_DATE} ${time}`;
  return NO_DATE;
}

export function mediaMarker(m: Message, transcription: string | undefined): string | null {
  switch (m.kind) {
    case 'audio':
    case 'voice':
      return transcription ? `[AUDIO — transcripción: ${transcription}]` : '[AUDIO: transcripción no disponible]';
    case 'image':
      return '[IMAGEN]';
    case 'video':
      return '[VÍDEO]';
    case 'gif':
      return '[GIF]';
    case 'sticker':
      return '[STICKER]';
    case 'document':
      return m.mediaLabel ? `[DOCUMENTO: ${m.mediaLabel}]` : '[DOCUMENTO]';
    case 'location':
      return '[UBICACIÓN]';
    case 'contact':
      return '[CONTACTO]';
    case 'poll':
      return '[ENCUESTA]';
    case 'call':
      return m.text ? null : '[LLAMADA]';
    case 'deleted':
      return '[MENSAJE ELIMINADO]';
    case 'unknown':
      return m.text ? null : '[CONTENIDO NO RECONOCIDO]';
    default:
      return null;
  }
}

/** Cuerpo del mensaje en líneas, sin cabecera. */
export function bodyLines(m: Message, chat: ChatInfo, mode: SenderLabelMode, transcription?: string): string[] {
  const lines: string[] = [];
  if (m.quote) {
    const who = quoteSenderLabel(m.quote.sender, mode, chat);
    const qLines = (m.quote.text || '[sin texto]').split('\n');
    lines.push(`> Respondiendo a ${who}: ${qLines[0]}`);
    for (const q of qLines.slice(1)) lines.push(`> ${q}`);
  }
  if (m.forwarded) lines.push('[Reenviado]');
  const marker = mediaMarker(m, transcription);
  if (marker) lines.push(marker);
  if (m.mediaFile) lines.push(`[ARCHIVO ADJUNTO EN EL ZIP: ${m.mediaFile}]`);
  else if (m.mediaMissing) lines.push(`[ARCHIVO NO INCLUIDO: ${m.mediaMissing}]`);
  if (m.text) lines.push(...m.text.split('\n'));
  if (m.truncated) lines.push('[TEXTO RECORTADO POR WHATSAPP: pulsa «Leer más» en WhatsApp para verlo completo]');
  if (lines.length === 0) lines.push('[SIN CONTENIDO VISIBLE]');
  return lines;
}

export function headerLine(m: Message, chat: ChatInfo, mode: SenderLabelMode): string {
  return `[${timestampLabel(m)}] ${senderLabel(m, chat, mode)}:${m.edited ? ' (editado)' : ''}`;
}

export function firstLastLabel(messages: Message[]): string {
  const dated = messages.filter((m) => m.when.date);
  if (dated.length === 0) return NO_DATE;
  const first = dated[0]!;
  const last = dated[dated.length - 1]!;
  const fmt = (m: Message) => `${displayDate(m.when.date!)}${m.when.time ? ` ${m.when.time}` : ''}`;
  return `${fmt(first)} - ${fmt(last)}`;
}

export function participantsLine(chat: ChatInfo, mode: SenderLabelMode, messages: Message[]): string {
  if (mode === 'roles' && !chat.isGroup) {
    return `CLIENTE = ${chat.name} · EMPRESA = mensajes enviados desde esta cuenta de WhatsApp`;
  }
  const names = new Set<string>();
  for (const m of messages) if (m.direction === 'in') names.add(m.sender ?? UNKNOWN_SENDER);
  const list = [...names].slice(0, 30).join(', ');
  return `EMPRESA = esta cuenta de WhatsApp${list ? ` · Otros: ${list}` : ''}${names.size > 30 ? ` y ${names.size - 30} más` : ''}`;
}
