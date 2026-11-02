import { useState } from 'react';
import { ArrowLeft, ShieldCheck, Stethoscope, Trash2 } from 'lucide-react';
import type { Settings } from '../../shared/types';
import { Button, Card, IconButton } from './ui';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
  onClearChat: () => void;
  onClearAll: () => void;
  onDiagnostics: () => void;
  connected: boolean;
  busy: string | null;
}

function NumberField({ label, value, min, max, onChange, suffix }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-right tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
        />
        <span className="w-8 text-[11px] text-zinc-500">{suffix}</span>
      </span>
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 text-[12px]">
      <span>
        <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
        {hint ? <span className="block text-[11px] text-zinc-500">{hint}</span> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-brand-500" />
    </label>
  );
}

/** Botón que pide una segunda pulsación para acciones destructivas. */
function ConfirmButton({ label, confirmLabel, onConfirm, disabled, loading }: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean; loading?: boolean }) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      variant="danger"
      className="h-8 w-full text-[12px]"
      disabled={disabled}
      loading={loading}
      icon={<Trash2 className="size-4" aria-hidden />}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          setTimeout(() => setArmed(false), 4000);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}

export function SettingsView({ settings, onChange, onBack, onClearChat, onClearAll, onDiagnostics, connected, busy }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <div className="wai-fade-in space-y-3 px-4 pb-4">
      <div className="flex items-center gap-1">
        <IconButton label="Volver" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
        </IconButton>
        <h2 className="text-[13px] font-semibold">Ajustes</h2>
      </div>

      <Card className="space-y-3">
        <fieldset>
          <legend className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Etiquetas de remitente</legend>
          <div className="mt-1.5 space-y-1.5 text-[12px]">
            <label className="flex items-center gap-2">
              <input type="radio" name="labels" checked={settings.senderLabels === 'roles'} onChange={() => set('senderLabels', 'roles')} className="accent-brand-500" />
              Roles: CLIENTE / EMPRESA <span className="text-zinc-500">(en grupos, nombre visible)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="labels" checked={settings.senderLabels === 'names'} onChange={() => set('senderLabels', 'names')} className="accent-brand-500" />
              Nombres visibles en WhatsApp
            </label>
          </div>
        </fieldset>
        <Toggle label="Incluir mensajes del sistema" hint="Avisos de cifrado, cambios de grupo, llamadas…" checked={settings.includeSystem} onChange={(v) => set('includeSystem', v)} />
      </Card>

      <Card className="space-y-2.5">
        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Recuperación de historial</p>
        <NumberField label="Límite de tiempo" value={settings.historyTimeLimitMin} min={1} max={60} suffix="min" onChange={(n) => set('historyTimeLimitMin', n)} />
        <NumberField label="Límite de mensajes" value={settings.historyMessageLimit} min={100} max={100000} suffix="msj" onChange={(n) => set('historyMessageLimit', n)} />
        <Toggle label="Volver al final del chat al terminar" checked={settings.scrollBackWhenDone} onChange={(v) => set('scrollBackWhenDone', v)} />
      </Card>

      <Card className="space-y-2.5">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-px size-4 shrink-0 text-brand-600" aria-hidden />
          <p className="text-[11.5px] leading-snug text-zinc-600 dark:text-zinc-400">
            Todo se procesa en este equipo. Las copias temporales viven en la memoria de sesión de Chrome (no en disco), caducan solas y se borran al cerrar el navegador.
          </p>
        </div>
        <NumberField label="Caducidad de copias temporales" value={settings.checkpointTtlHours} min={1} max={72} suffix="h" onChange={(n) => set('checkpointTtlHours', n)} />
        <ConfirmButton label="Borrar datos de este chat" confirmLabel="Pulsa otra vez para borrar" onConfirm={onClearChat} disabled={!connected} loading={busy === 'clear-chat'} />
        <ConfirmButton label="Borrar todos los datos temporales" confirmLabel="Pulsa otra vez para borrar todo" onConfirm={onClearAll} loading={busy === 'clear-all'} />
      </Card>

      <Button className="h-8 w-full text-[12px]" onClick={onDiagnostics} disabled={!connected} loading={busy === 'diag'} icon={<Stethoscope className="size-4" aria-hidden />}>
        Copiar diagnóstico de selectores (sin contenido)
      </Button>
    </div>
  );
}
