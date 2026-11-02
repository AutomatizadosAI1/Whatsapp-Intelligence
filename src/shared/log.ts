/**
 * Registro de diagnóstico. En producción no escribe nada, y nunca debe recibir
 * contenido de mensajes: solo contadores, códigos y nombres de fase.
 */
const enabled = import.meta.env.DEV === true;

export function debug(event: string, data?: Record<string, number | string | boolean | null>): void {
  if (!enabled) return;
  console.debug(`[WAI] ${event}`, data ?? '');
}
