import { useCallback, useEffect, useRef, useState } from 'react';
import type { StateResponse } from '../shared/protocol';
import { findWhatsAppTab, sendToTab, TabMessageError } from './api';

export type Connection =
  | { kind: 'loading' }
  | { kind: 'no-tab' }
  | { kind: 'not-ready'; tabId: number; message: string }
  | { kind: 'ready'; tabId: number; background: boolean; state: StateResponse };

/** Estado de la pestaña de WhatsApp Web, con sondeo mientras el popup está abierto. */
export function useWhatsApp() {
  const [conn, setConn] = useState<Connection>({ kind: 'loading' });
  const inFlight = useRef(false);

  const refresh = useCallback(async (deep: boolean): Promise<void> => {
    if (inFlight.current && !deep) return;
    inFlight.current = true;
    try {
      const found = await findWhatsAppTab();
      if (!found?.id) {
        setConn({ kind: 'no-tab' });
        return;
      }
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        const state = await sendToTab<StateResponse>(found.id, { type: 'WAI_GET_STATE', refresh: deep }, 8_000);
        setConn({ kind: 'ready', tabId: found.id, background: active?.id !== found.id, state });
      } catch (e) {
        const message =
          e instanceof TabMessageError && e.kind === 'no-receiver'
            ? 'La extensión todavía no está activa en la pestaña de WhatsApp Web (suele pasar si WhatsApp ya estaba abierto al instalarla).'
            : e instanceof Error
              ? e.message
              : 'No se pudo conectar con WhatsApp Web.';
        setConn({ kind: 'not-ready', tabId: found.id, message });
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(true), 0);
    return () => clearTimeout(first);
  }, [refresh]);

  const running = conn.kind === 'ready' && conn.state.job?.state === 'running';
  const wasRunning = useRef(false);
  useEffect(() => {
    const id = setInterval(() => void refresh(false), running ? 700 : 2_000);
    if (wasRunning.current && !running) void refresh(true);
    wasRunning.current = running;
    return () => clearInterval(id);
  }, [running, refresh]);

  return { conn, refresh };
}
