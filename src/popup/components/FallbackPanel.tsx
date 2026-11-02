import { useRef, useState } from 'react';
import { ClipboardCopy, Download, TextSelect } from 'lucide-react';
import type { TextBlock } from '../../export/blocks';
import { writeClipboard } from '../clipboard';
import { Button, Card } from './ui';

export interface FallbackData {
  text: string;
  blocks: TextBlock[];
  filename: string;
  reason: string;
}

/** Alternativa manual cuando el portapapeles falla: texto seleccionable, partes y descarga. */
export function FallbackPanel({ data, onDownload, onClose }: { data: FallbackData; onDownload: () => void; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<Record<number, 'ok' | 'error'>>({});

  const selectAll = () => {
    ref.current?.focus();
    ref.current?.select();
  };

  const copyBlock = async (index: number, text: string) => {
    const r = await writeClipboard(text);
    setCopied((prev) => ({ ...prev, [index]: r.ok ? 'ok' : 'error' }));
  };

  return (
    <Card className="wai-fade-in border-amber-300 dark:border-amber-900/70">
      <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">No se pudo copiar al portapapeles</p>
      <p className="mt-0.5 text-[11.5px] text-zinc-600 dark:text-zinc-400">{data.reason} Selecciona el texto y cópialo con Ctrl+C, cópialo por partes o descárgalo.</p>
      <textarea
        ref={ref}
        readOnly
        value={data.text}
        aria-label="Conversación para copiar manualmente"
        data-testid="fallback-text"
        className="mt-2 h-28 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 p-2 font-mono text-[10.5px] leading-snug text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button className="h-8 text-[12px]" onClick={selectAll} icon={<TextSelect className="size-4" aria-hidden />}>
          Seleccionar todo
        </Button>
        <Button className="h-8 text-[12px]" onClick={onDownload} icon={<Download className="size-4" aria-hidden />}>
          Descargar TXT
        </Button>
      </div>
      {data.blocks.length > 1 ? (
        <div className="mt-2.5">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Copiar por partes ({data.blocks.length} bloques numerados, sin recortes)</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {data.blocks.map((b) => (
              <Button
                key={b.index}
                variant={copied[b.index] === 'ok' ? 'primary' : 'secondary'}
                className="h-7 text-[11px]"
                onClick={() => void copyBlock(b.index, b.text)}
                icon={<ClipboardCopy className="size-3.5" aria-hidden />}
              >
                {copied[b.index] === 'ok' ? `Parte ${b.index} ✓` : copied[b.index] === 'error' ? `Parte ${b.index} ✗` : `Parte ${b.index}/${b.total}`}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <button type="button" onClick={onClose} className="mt-2 text-[11px] text-zinc-500 underline-offset-2 hover:underline">
        Cerrar
      </button>
    </Card>
  );
}
