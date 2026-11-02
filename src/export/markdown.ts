import type { ExportDocument } from './document';
import { formatHeader } from './txt';
import { bodyLines, headerLine } from './format';

/** Neutraliza HTML y sintaxis Markdown al inicio de línea para que el contenido no se interprete. */
export function escapeMarkdownLine(line: string): string {
  const html = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return html.replace(/^(\s*)([#>*+-]|\d+\.|```|~~~|\|)/, '$1\\$2');
}

export function formatMarkdown(doc: ExportDocument): string {
  const out: string[] = [];
  out.push(`# Conversación de WhatsApp: ${escapeMarkdownLine(doc.chat.name)}`, '');
  for (const line of formatHeader(doc)) {
    if (line.startsWith('- ')) out.push(`- ${escapeMarkdownLine(line.slice(2))}`);
    else {
      const idx = line.indexOf(':');
      out.push(idx > 0 ? `**${line.slice(0, idx)}:**${escapeMarkdownLine(line.slice(idx + 1))}  ` : escapeMarkdownLine(line));
    }
  }
  out.push('', '---', '', '## Mensajes', '');
  if (doc.messages.length === 0) out.push('_No hay mensajes que exportar con el filtro actual._');
  for (const m of doc.messages) {
    out.push(`**${escapeMarkdownLine(headerLine(m, doc.chat, doc.senderLabels))}**  `);
    const lines = bodyLines(m, doc.chat, doc.senderLabels, doc.transcriptions.get(m.key));
    for (const l of lines) {
      if (l.startsWith('> ')) out.push(`> ${escapeMarkdownLine(l.slice(2))}  `);
      else out.push(`${escapeMarkdownLine(l)}  `);
    }
    out.push('');
  }
  return `${out.join('\n')}\n`;
}
