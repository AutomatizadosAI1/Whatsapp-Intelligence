import type { ReactNode } from 'react';

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="wai-fade-in flex flex-col items-center px-6 py-8 text-center" data-testid="empty-state">
      <div className="flex size-11 items-center justify-center rounded-full bg-zinc-200/70 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{icon}</div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{body}</p>
      {action ? <div className="mt-4 w-full">{action}</div> : null}
    </div>
  );
}
