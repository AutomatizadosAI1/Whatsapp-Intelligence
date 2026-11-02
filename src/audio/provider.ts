/**
 * Arquitectura opcional de transcripción de audio (V2).
 *
 * La V1 solo reconoce los mensajes de audio y deja un marcador cronológico.
 * No se descargan audios ni se interceptan flujos de WhatsApp. Un proveedor
 * futuro debe:
 *  - recibir el audio por un medio autorizado (p. ej. un archivo que el usuario
 *    exporta y selecciona manualmente), nunca extrayéndolo de WhatsApp Web;
 *  - si es remoto: consentimiento explícito, backend propio seguro, claves fuera
 *    de la extensión y aviso de transferencia de datos;
 *  - no bloquear nunca la copia del texto (la transcripción va aparte).
 */
import type { Message } from '../shared/types';

export interface AudioReference {
  messageKey: string;
  kind: 'audio' | 'voice';
  date: string | null;
  time: string | null;
}

export type TranscriptionResult =
  | { status: 'ok'; text: string }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; reason: string };

export interface TranscriptionProvider {
  readonly id: string;
  readonly label: string;
  /** True si envía audio fuera del equipo: exige consentimiento explícito. */
  readonly remote: boolean;
  isAvailable(): Promise<boolean>;
  transcribe(ref: AudioReference, signal: AbortSignal): Promise<TranscriptionResult>;
}

/** Proveedor por defecto de la V1: no transcribe y lo dice. */
export const noTranscriptionProvider: TranscriptionProvider = {
  id: 'none',
  label: 'Sin transcripción (V1)',
  remote: false,
  isAvailable: async () => false,
  transcribe: async () => ({ status: 'unavailable', reason: 'La V1 no incluye transcripción de audio.' }),
};

export function collectAudioReferences(messages: Message[]): AudioReference[] {
  return messages
    .filter((m): m is Message & { kind: 'audio' | 'voice' } => m.kind === 'audio' || m.kind === 'voice')
    .map((m) => ({ messageKey: m.key, kind: m.kind, date: m.when.date, time: m.when.time }));
}

export interface TranscribeOptions {
  /** Consentimiento explícito del usuario (obligatorio para proveedores remotos). */
  consentGiven: boolean;
  signal: AbortSignal;
}

/**
 * Transcribe en serie y devuelve solo los resultados correctos. Los fallos se
 * cuentan pero no detienen el proceso ni afectan a la copia del texto.
 */
export async function transcribeAll(
  provider: TranscriptionProvider,
  refs: AudioReference[],
  options: TranscribeOptions,
): Promise<{ transcriptions: Map<string, string>; failed: number; skipped: boolean }> {
  const transcriptions = new Map<string, string>();
  if (provider.remote && !options.consentGiven) return { transcriptions, failed: 0, skipped: true };
  if (!(await provider.isAvailable())) return { transcriptions, failed: 0, skipped: true };
  let failed = 0;
  for (const ref of refs) {
    if (options.signal.aborted) break;
    try {
      const r = await provider.transcribe(ref, options.signal);
      if (r.status === 'ok' && r.text.trim()) transcriptions.set(ref.messageKey, r.text.trim());
      else failed++;
    } catch {
      failed++;
    }
  }
  return { transcriptions, failed, skipped: false };
}
