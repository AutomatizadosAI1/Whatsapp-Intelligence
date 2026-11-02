import { Users, User } from 'lucide-react';
import type { StateResponse } from '../../shared/protocol';
import { displayDate } from '../../normalization/dates';
import { Badge, Card, Stat, type Tone } from './ui';

export function coverageBadge(state: Pick<StateResponse, 'startReached' | 'historyAttempted'>): { label: string; tone: Tone } {
  if (state.startReached) return { label: 'Inicio aparente alcanzado', tone: 'green' };
  if (state.historyAttempted) return { label: 'Recuperación parcial', tone: 'amber' };
  return { label: 'Solo mensajes cargados', tone: 'zinc' };
}

export function ChatCard({ state, background }: { state: StateResponse; background: boolean }) {
  const chat = state.chat!;
  const cov = coverageBadge(state);
  return (
    <Card className="wai-fade-in">
      <div className="flex items-start gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {chat.isGroup ? <Users className="size-4" aria-hidden /> : <User className="size-4" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Chat activo</p>
          <p className="truncate text-sm font-semibold" title={chat.name} data-testid="chat-name">
            {chat.name}
          </p>
        </div>
        {chat.isGroup ? <Badge tone="blue">Grupo</Badge> : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <Stat
          label="Mensajes detectados"
          value={<span data-testid="stored-count">{state.storedCount.toLocaleString('es-ES')}</span>}
          hint={`${state.domCount.toLocaleString('es-ES')} en pantalla ahora`}
        />
        <div className="min-w-0">
          <dt className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Cobertura</dt>
          <dd className="mt-1" data-testid="coverage">
            <Badge tone={cov.tone}>{cov.label}</Badge>
          </dd>
        </div>
        <Stat label="Más antiguo" value={state.oldest ? displayDate(state.oldest) : 'Sin fecha'} />
        <Stat label="Más reciente" value={state.newest ? displayDate(state.newest) : 'Sin fecha'} />
      </dl>
      {background ? (
        <p className="mt-2.5 text-[11px] text-zinc-500 dark:text-zinc-400">Usando la pestaña de WhatsApp Web abierta en segundo plano.</p>
      ) : null}
      {state.tabHidden && state.job?.state === 'running' ? (
        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
          La pestaña de WhatsApp está oculta: Chrome ralentiza la recuperación. Mantenla visible.
        </p>
      ) : null}
    </Card>
  );
}
