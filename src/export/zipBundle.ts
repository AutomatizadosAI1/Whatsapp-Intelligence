/**
 * Contenido del ZIP para IA: conversación (TXT y JSON), instrucciones para la
 * IA y la carpeta media/ con fotos, audios y vídeos. Cada mensaje con archivo
 * indica en el texto qué archivo del ZIP le corresponde.
 */
import type { Message } from '../shared/types';
import type { ExportDocument } from './document';
import { formatTxt } from './txt';
import { formatJson } from './json';
import { formatForAi } from './aiPrompt';
import type { ZipEntry } from './zip';

export interface BundleMedia {
  kind: 'image' | 'video' | 'audio' | 'document';
  blob: Blob;
}

const EXT_BY_TYPE: Array<[RegExp, string]> = [
  [/^image\/jpe?g/i, 'jpg'],
  [/^image\/png/i, 'png'],
  [/^image\/webp/i, 'webp'],
  [/^image\/gif/i, 'gif'],
  [/^video\/mp4/i, 'mp4'],
  [/^video\/webm/i, 'webm'],
  [/^video\/quicktime/i, 'mov'],
  [/^audio\/ogg/i, 'ogg'],
  [/^audio\/mpeg/i, 'mp3'],
  [/^audio\/(mp4|aac|x-m4a)/i, 'm4a'],
  [/^audio\/wav/i, 'wav'],
  [/^audio\/webm/i, 'webm'],
  [/^application\/pdf/i, 'pdf'],
  [/wordprocessingml/i, 'docx'],
  [/spreadsheetml/i, 'xlsx'],
  [/presentationml/i, 'pptx'],
  [/^application\/msword/i, 'doc'],
  [/^application\/vnd\.ms-excel/i, 'xls'],
  [/^application\/(zip|x-zip-compressed)/i, 'zip'],
  [/^text\/csv/i, 'csv'],
  [/^text\/plain/i, 'txt'],
];

export function mediaExtension(type: string, kind: BundleMedia['kind']): string {
  for (const [re, ext] of EXT_BY_TYPE) if (re.test(type)) return ext;
  return kind === 'image' ? 'jpg' : kind === 'video' ? 'mp4' : kind === 'document' ? 'bin' : 'ogg';
}

const KIND_LABEL: Record<BundleMedia['kind'], string> = { image: 'foto', video: 'video', audio: 'audio', document: 'documento' };
const MEDIA_MESSAGE_KINDS = new Set(['image', 'video', 'voice', 'audio', 'document']);

/** Nombre original del documento sin caracteres que Windows no admite ni separadores de ruta. */
function safeOriginalName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function mediaFileName(index: number, m: Message, media: BundleMedia): string {
  const date = m.when.date ?? 'sin-fecha';
  const time = m.when.time ? `_${m.when.time.replace(':', '')}` : '';
  const who = m.direction === 'out' ? 'empresa' : m.direction === 'in' ? 'cliente' : 'sistema';
  const base = `media/${String(index + 1).padStart(4, '0')}_${date}${time}_${who}_${KIND_LABEL[media.kind]}`;
  if (media.kind === 'document' && m.mediaLabel) {
    const original = safeOriginalName(m.mediaLabel);
    if (/\.[A-Za-z0-9]{2,6}$/.test(original)) return `${base}_${original}`;
  }
  return `${base}.${mediaExtension(media.blob.type, media.kind)}`;
}

export interface ZipBundle {
  entries: ZipEntry[];
  files: number;
  bytes: number;
  missing: number;
  doc: ExportDocument;
}

export function buildZipBundle(
  doc: ExportDocument,
  media: Map<string, BundleMedia>,
  failures: Map<string, string>,
  version: string,
): ZipBundle {
  const mediaEntries: ZipEntry[] = [];
  let bytes = 0;
  let missing = 0;
  const messages = doc.messages.map((m, i) => {
    if (!MEDIA_MESSAGE_KINDS.has(m.kind)) return m;
    const file = media.get(m.key);
    if (file) {
      const path = mediaFileName(i, m, file);
      mediaEntries.push({ path, data: file.blob });
      bytes += file.blob.size;
      return { ...m, mediaFile: path, mediaMissing: null };
    }
    missing++;
    const reason = failures.get(m.key) ?? 'no se llegó a mostrar en pantalla durante la descarga';
    return { ...m, mediaFile: null, mediaMissing: reason };
  });

  const warnings = [...doc.warnings];
  if (missing > 0) warnings.push(`${missing} archivos multimedia no se pudieron incluir en el ZIP (se indica el motivo en cada mensaje).`);
  const zipDoc: ExportDocument = { ...doc, messages, warnings };

  const readme = [
    'ZIP generado por WhatsApp Intelligence (AutomatizadosAI) · procesamiento 100 % local.',
    '',
    `Conversación: ${doc.chat.name}`,
    `Mensajes: ${messages.length} · Archivos multimedia incluidos: ${mediaEntries.length}${missing > 0 ? ` · No incluidos: ${missing}` : ''}`,
    '',
    'Contenido:',
    '- PARA_LA_IA.txt: instrucciones de análisis + conversación completa. Es lo primero que hay que pasar a la IA.',
    '- conversacion.txt: la conversación en texto, con la ruta del archivo adjunto en cada foto, audio o vídeo.',
    '- conversacion.json: la misma conversación en formato estructurado.',
    '- media/: fotos, audios, vídeos y documentos. El nombre lleva número, fecha, hora, quién lo envió y tipo; los documentos conservan su nombre original.',
    '',
    'Cómo pasarlo a la IA: sube PARA_LA_IA.txt y los archivos de media/. Si la IA no acepta ZIP, audio o vídeo,',
    'descomprime el ZIP y sube el texto y las fotos sueltas; los audios pueden transcribirse aparte.',
    '',
    'Contiene datos confidenciales de clientes: compártelo solo por canales autorizados y bórralo cuando ya no haga falta.',
    '',
  ].join('\n');

  const aiNote =
    mediaEntries.length > 0
      ? '\nNOTA: los mensajes con «[ARCHIVO ADJUNTO EN EL ZIP: media/…]» tienen ese archivo en la carpeta media/. Analiza también las fotos, audios, vídeos y documentos adjuntos.\n'
      : '';

  return {
    entries: [
      { path: 'LEEME.txt', data: readme },
      { path: 'PARA_LA_IA.txt', data: formatForAi(zipDoc).replace('\n===== INICIO DE LA CONVERSACIÓN =====', `${aiNote}\n===== INICIO DE LA CONVERSACIÓN =====`) },
      { path: 'conversacion.txt', data: formatTxt(zipDoc) },
      { path: 'conversacion.json', data: formatJson(zipDoc, version) },
      ...mediaEntries,
    ],
    files: mediaEntries.length,
    bytes,
    missing,
    doc: zipDoc,
  };
}
