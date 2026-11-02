import type { ChatInfo, ConversationSnapshot, Coverage, Message, RangeSelection, Settings } from '../shared/types';
import { displayDate } from '../normalization/dates';
import { chronologyInversions } from '../deduplication/merge';
import { applyRange, type RangeBounds } from './range';

export const COVERAGE_TEXT: Record<Coverage, string> = {
  'loaded-only': 'Solo mensajes cargados',
  partial: 'Recuperación parcial',
  'start-reached': 'Inicio aparente alcanzado',
};

export const RANGE_TEXT: Record<RangeSelection['mode'], string> = {
  loaded: 'Mensajes cargados y recuperados',
  last7: 'Últimos 7 días',
  last30: 'Últimos 30 días',
  custom: 'Fechas personalizadas',
  all: 'Todo lo recuperable',
};

export interface ExportDocument {
  chat: ChatInfo;
  exportedAt: Date;
  messages: Message[];
  coverage: Coverage;
  coverageText: string;
  warnings: string[];
  range: RangeSelection;
  bounds: RangeBounds;
  senderLabels: Settings['senderLabels'];
  totals: { captured: number; exported: number; excludedUndated: number };
  /** Transcripciones opcionales por clave de mensaje (proveedor de audio). */
  transcriptions: Map<string, string>;
}

export interface BuildOptions {
  range: RangeSelection;
  settings: Pick<Settings, 'senderLabels' | 'includeSystem'>;
  now: Date;
  transcriptions?: Map<string, string>;
}

export function buildExportDocument(snapshot: ConversationSnapshot, options: BuildOptions): ExportDocument {
  const base = options.settings.includeSystem
    ? snapshot.messages
    : snapshot.messages.filter((m) => m.direction !== 'system');
  const ranged = applyRange(base, options.range, options.now, snapshot.startReached);
  const messages = ranged.messages;

  let coverageText = COVERAGE_TEXT[snapshot.coverage];
  if (ranged.bounds.from && ranged.coveredByEvidence && snapshot.coverage !== 'start-reached') {
    coverageText += ' (el rango solicitado está cubierto: se capturaron mensajes anteriores a su inicio)';
  }

  const warnings = [...snapshot.warnings];
  if (snapshot.coverage === 'loaded-only') {
    warnings.push(
      'Solo se incluyen los mensajes cargados en WhatsApp Web. Puede haber mensajes anteriores no recuperados: usa RECUPERAR HISTORIAL.',
    );
  } else if (snapshot.coverage === 'partial' && !ranged.coveredByEvidence) {
    warnings.push('La recuperación del historial no llegó al inicio del chat: puede faltar la parte más antigua.');
  }
  if (ranged.bounds.from && !ranged.coveredByEvidence) {
    warnings.push(
      `No hay evidencia de que se hayan capturado todos los mensajes desde el ${displayDate(ranged.bounds.from)}: recupera el historial para cubrir el rango.`,
    );
  }
  if (ranged.excludedUndated > 0) {
    warnings.push(`${ranged.excludedUndated} mensajes sin fecha fiable quedan fuera del rango por no poder ubicarlos.`);
  }
  const truncated = messages.filter((m) => m.truncated).length;
  if (truncated > 0) {
    warnings.push(`${truncated} mensajes largos aparecen recortados por WhatsApp («Leer más»): ábrelos en WhatsApp para ver el texto completo.`);
  }
  const unknown = messages.filter((m) => m.direction === 'in' && !m.senderKnown).length;
  if (unknown > 0) warnings.push(`${unknown} mensajes recibidos sin remitente visible (REMITENTE DESCONOCIDO).`);
  const assumed = messages.filter((m) => m.when.dateAssumed).length;
  if (assumed > 0) {
    warnings.push(`${assumed} fechas tienen el orden día/mes o el año deducido (marcadas como «fecha deducida»).`);
  }
  const undated = messages.filter((m) => !m.when.date && m.direction !== 'system').length;
  if (undated > 0) warnings.push(`${undated} mensajes sin fecha disponible (FECHA NO DISPONIBLE).`);
  const inversions = chronologyInversions(messages);
  if (inversions > 0) {
    warnings.push(`${inversions} saltos de hora no cronológicos detectados: se conserva el orden en que WhatsApp muestra los mensajes.`);
  }

  return {
    chat: snapshot.chat,
    exportedAt: options.now,
    messages,
    coverage: snapshot.coverage,
    coverageText,
    warnings,
    range: options.range,
    bounds: ranged.bounds,
    senderLabels: options.settings.senderLabels,
    totals: { captured: snapshot.messages.length, exported: messages.length, excludedUndated: ranged.excludedUndated },
    transcriptions: options.transcriptions ?? new Map(),
  };
}
