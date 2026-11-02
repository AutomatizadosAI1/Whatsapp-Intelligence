import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';

export interface Feedback {
  type: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

const STYLES = {
  success: 'border-brand-500/30 bg-brand-500/10 text-brand-800 dark:text-brand-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
};

export function FeedbackBanner({ feedback, onClose }: { feedback: Feedback; onClose: () => void }) {
  const Icon = feedback.type === 'success' ? CircleCheck : feedback.type === 'error' ? CircleAlert : Info;
  return (
    <div
      role={feedback.type === 'error' ? 'alert' : 'status'}
      aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
      data-testid={`feedback-${feedback.type}`}
      className={`wai-fade-in flex items-start gap-2 rounded-lg border px-3 py-2.5 ${STYLES[feedback.type]}`}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold leading-snug">{feedback.title}</p>
        {feedback.detail ? <p className="mt-0.5 text-[11.5px] leading-snug opacity-90">{feedback.detail}</p> : null}
      </div>
      <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="rounded p-0.5 opacity-60 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-brand-500">
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
