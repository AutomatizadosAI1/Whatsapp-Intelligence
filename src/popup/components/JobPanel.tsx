import { CircleStop, FileArchive, History } from 'lucide-react';
import type { JobStatus } from '../../shared/types';
import { Badge, Button, Card, type Tone } from './ui';

const STATE_LABEL: Record<JobStatus['state'], { label: string; tone: Tone }> = {
  idle: { label: 'En espera', tone: 'zinc' },
  running: { label: 'Recuperando', tone: 'blue' },
  done: { label: 'Terminado', tone: 'green' },
  cancelled: { label: 'Cancelado', tone: 'amber' },
  error: { label: 'Detenido', tone: 'red' },
  interrupted: { label: 'Interrumpido', tone: 'amber' },
};

function elapsed(job: JobStatus): string {
  const s = Math.max(0, Math.round((job.updatedAt - job.startedAt) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function JobPanel({ job, onCancel, cancelling }: { job: JobStatus; onCancel: () => void; cancelling: boolean }) {
  const running = job.state === 'running';
  const zip = job.kind === 'zip';
  const st = zip && job.state === 'running' ? { label: 'Creando ZIP', tone: 'blue' as Tone } : STATE_LABEL[job.state];
  const m = job.media;
  return (
    <Card className="wai-fade-in" >
      <div className="flex items-center gap-2" aria-live="polite">
        {zip ? <FileArchive className="size-4 text-zinc-500" aria-hidden /> : <History className="size-4 text-zinc-500" aria-hidden />}
        <p className="flex-1 text-[12px] font-semibold">{zip ? 'ZIP para IA' : 'Historial'}</p>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      {running ? (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-label="Recuperando historial" aria-valuetext={`${job.captured} mensajes capturados`}>
          <div className="wai-indeterminate h-full w-2/5 rounded-full bg-brand-500" />
        </div>
      ) : null}
      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[10.5px] text-zinc-500 dark:text-zinc-400">Capturados</dt>
          <dd className="text-[13px] font-semibold tabular-nums" data-testid="job-captured">{job.captured.toLocaleString('es-ES')}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] text-zinc-500 dark:text-zinc-400">Lotes</dt>
          <dd className="text-[13px] font-semibold tabular-nums">{job.batches}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] text-zinc-500 dark:text-zinc-400">Tiempo</dt>
          <dd className="text-[13px] font-semibold tabular-nums">{elapsed(job)}</dd>
        </div>
      </dl>
      {zip && m ? (
        <p className="mt-2 text-center text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400" data-testid="job-media">
          {m.images} fotos · {m.videos} vídeos · {m.audios} audios · {m.documents ?? 0} documentos{m.failed ? ` · ${m.failed} fallidos` : ''} · {(m.bytes / 1048576).toFixed(1)} MB
        </p>
      ) : null}
      <p className="mt-2 text-[11.5px] leading-snug text-zinc-600 dark:text-zinc-400" data-testid="job-message">{job.message}</p>
      {running ? (
        <Button variant="danger" className="mt-2.5 h-8 w-full text-[12px]" onClick={onCancel} loading={cancelling} icon={<CircleStop className="size-4" aria-hidden />}>
          Cancelar (se conserva lo capturado)
        </Button>
      ) : null}
    </Card>
  );
}
