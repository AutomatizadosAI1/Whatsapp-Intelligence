import { displayDate, displayDateTime } from '../normalization/dates';
import type { ExportDocument } from './document';
import { RANGE_TEXT } from './document';
import { bodyLines, firstLastLabel, headerLine, participantsLine } from './format';

export function formatHeader(doc: ExportDocument): string[] {
  const lines = [
    `CONVERSACIÓN: ${doc.chat.name}`,
    `EXPORTADO: ${displayDateTime(doc.exportedAt)}`,
    `MENSAJES RECUPERADOS: ${doc.totals.exported}`,
    `RANGO: ${firstLastLabel(doc.messages)}`,
    `COBERTURA: ${doc.coverageText}`,
    `TIPO DE CHAT: ${doc.chat.isGroup ? 'Grupo' : 'Individual'}`,
    `PARTICIPANTES: ${participantsLine(doc.chat, doc.senderLabels, doc.messages)}`,
  ];
  if (doc.range.mode !== 'loaded' && doc.range.mode !== 'all') {
    const b = doc.bounds;
    lines.push(
      `FILTRO: ${RANGE_TEXT[doc.range.mode]}${b.from || b.to ? ` (${b.from ? displayDate(b.from) : '…'} - ${b.to ? displayDate(b.to) : '…'})` : ''} · ${doc.totals.exported} de ${doc.totals.captured} mensajes capturados`,
    );
  }
  if (doc.warnings.length === 0) {
    lines.push('ADVERTENCIAS: ninguna');
  } else {
    lines.push('ADVERTENCIAS:');
    for (const w of doc.warnings) lines.push(`- ${w}`);
  }
  return lines;
}

/** Un bloque de texto por mensaje (cabecera + cuerpo). */
export function formatMessageBlocks(doc: ExportDocument): string[] {
  return doc.messages.map((m) =>
    [headerLine(m, doc.chat, doc.senderLabels), ...bodyLines(m, doc.chat, doc.senderLabels, doc.transcriptions.get(m.key))].join('\n'),
  );
}

export function formatTxt(doc: ExportDocument): string {
  const blocks = formatMessageBlocks(doc);
  const body = blocks.length > 0 ? blocks.join('\n\n') : '(No hay mensajes que exportar con el filtro actual.)';
  return `${formatHeader(doc).join('\n')}\n\n${body}\n`;
}
