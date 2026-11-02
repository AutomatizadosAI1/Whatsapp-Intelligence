import type { RangeMode, RangeSelection } from '../../shared/types';

const OPTIONS: Array<{ mode: RangeMode; label: string; title: string }> = [
  { mode: 'loaded', label: 'Cargados', title: 'Mensajes cargados y recuperados en esta sesión' },
  { mode: 'last7', label: '7 días', title: 'Últimos 7 días' },
  { mode: 'last30', label: '30 días', title: 'Últimos 30 días' },
  { mode: 'custom', label: 'Fechas', title: 'Fechas personalizadas' },
  { mode: 'all', label: 'Todo', title: 'Todo lo recuperable' },
];

export function RangePicker({ value, onChange, disabled }: { value: RangeSelection; onChange: (r: RangeSelection) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Rango</legend>
      <div role="radiogroup" aria-label="Rango de mensajes" className="grid grid-cols-5 gap-0.5 rounded-lg bg-zinc-200/60 p-0.5 dark:bg-zinc-800/80">
        {OPTIONS.map((o) => {
          const selected = value.mode === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              title={o.title}
              onClick={() => onChange({ ...value, mode: o.mode })}
              className={`rounded-md px-1 py-1 text-[11.5px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-brand-500 ${
                selected
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {value.mode === 'custom' ? (
        <div className="wai-fade-in mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Desde
            <input
              type="date"
              value={value.from ?? ''}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="mt-0.5 block w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark]"
            />
          </label>
          <label className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Hasta
            <input
              type="date"
              value={value.to ?? ''}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="mt-0.5 block w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark]"
            />
          </label>
        </div>
      ) : null}
    </fieldset>
  );
}
