import { MessageSquareText, Settings as SettingsIcon } from 'lucide-react';
import type { Connection } from '../useWhatsApp';
import { IconButton } from './ui';

function status(conn: Connection): { label: string; dot: string } {
  switch (conn.kind) {
    case 'loading':
      return { label: 'Buscando…', dot: 'bg-zinc-400' };
    case 'no-tab':
      return { label: 'Sin WhatsApp Web', dot: 'bg-red-500' };
    case 'not-ready':
      return { label: 'No activo', dot: 'bg-amber-500' };
    case 'ready':
      return conn.state.chat
        ? { label: 'Conectado', dot: 'bg-brand-500' }
        : { label: 'Sin chat abierto', dot: 'bg-amber-500' };
  }
}

export function Header({ conn, onSettings }: { conn: Connection; onSettings?: () => void }) {
  const s = status(conn);
  return (
    <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
      <div className="flex size-8 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm shadow-brand-700/30">
        <MessageSquareText className="size-4.5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-[13px] leading-tight font-semibold tracking-tight">WhatsApp Intelligence</h1>
        <p className="text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">Uso interno · AutomatizadosAI</p>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">
        <span className={`relative inline-flex size-2 rounded-full ${s.dot}`}>
          {conn.kind === 'ready' && conn.state.chat ? (
            <span className={`absolute inset-0 animate-ping rounded-full opacity-40 motion-reduce:hidden ${s.dot}`} />
          ) : null}
        </span>
        {s.label}
      </div>
      {onSettings ? (
        <IconButton label="Ajustes" onClick={onSettings}>
          <SettingsIcon className="size-4" aria-hidden />
        </IconButton>
      ) : null}
    </header>
  );
}
