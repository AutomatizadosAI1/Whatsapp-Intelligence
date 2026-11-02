import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, FileArchive, History, MessageCircleOff, RefreshCw, ShieldCheck, Sparkles, Smartphone } from 'lucide-react';
import type { DiagnosticsResponse, ExtractResponse, SimpleResponse } from '../shared/protocol';
import { DEFAULT_SETTINGS, type RangeSelection, type Settings } from '../shared/types';
import { buildExportDocument, type ExportDocument } from '../export/document';
import { formatHeader, formatMessageBlocks, formatTxt } from '../export/txt';
import { formatMarkdown } from '../export/markdown';
import { formatJson } from '../export/json';
import { AI_INSTRUCTIONS, formatForAi } from '../export/aiPrompt';
import { splitIntoBlocks } from '../export/blocks';
import { exportFilename } from '../export/filename';
import { rangeBounds } from '../export/range';
import { loadSettings, saveSettings } from '../storage/settings';
import { sendToBackground, sendToTab, WA_ORIGIN } from './api';
import { writeClipboard } from './clipboard';
import { downloadText } from './download';
import { useWhatsApp } from './useWhatsApp';
import { Header } from './components/Header';
import { ChatCard } from './components/ChatCard';
import { RangePicker } from './components/RangePicker';
import { JobPanel } from './components/JobPanel';
import { FeedbackBanner, type Feedback } from './components/FeedbackBanner';
import { FallbackPanel, type FallbackData } from './components/FallbackPanel';
import { EmptyState } from './components/EmptyState';
import { SettingsView } from './components/SettingsView';
import { Button } from './components/ui';

type Busy = 'copy' | 'ai' | 'txt' | 'md' | 'json' | 'history' | 'zip' | 'cancel' | 'clear-chat' | 'clear-all' | 'diag' | null;

const VERSION = chrome.runtime.getManifest().version;
const BLOCK_CHARS = 100_000;

export function App() {
  const { conn, refresh } = useWhatsApp();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [range, setRange] = useState<RangeSelection>({ mode: 'loaded' });
  const [busy, setBusy] = useState<Busy>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [fallback, setFallback] = useState<FallbackData | null>(null);
  const [view, setView] = useState<'main' | 'settings'>('main');

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const ready = conn.kind === 'ready' ? conn : null;
  const chat = ready?.state.chat ?? null;
  const job = ready?.state.job ?? null;
  const running = job?.state === 'running';

  const updateSettings = (s: Settings) => {
    setSettings(s);
    void saveSettings(s);
  };

  async function extractDocument(): Promise<ExportDocument | null> {
    if (!ready) return null;
    if (range.mode === 'custom' && !range.from && !range.to) {
      setFeedback({ type: 'error', title: 'Elige al menos una fecha', detail: 'Indica «Desde», «Hasta» o ambas para el rango personalizado.' });
      return null;
    }
    const res = await sendToTab<ExtractResponse>(ready.tabId, { type: 'WAI_EXTRACT' }, 30_000);
    if (!res.ok) {
      setFeedback({ type: 'error', title: 'No se pudo leer la conversación', detail: res.error });
      return null;
    }
    const doc = buildExportDocument(res.snapshot, { range, settings, now: new Date() });
    if (doc.messages.length === 0) {
      setFeedback({
        type: 'error',
        title: 'No hay mensajes que copiar',
        detail:
          res.snapshot.messages.length > 0
            ? `Ninguno de los ${res.snapshot.messages.length} mensajes capturados cae dentro del rango elegido.`
            : 'No se detectaron mensajes en el chat abierto. Espera a que cargue o desplázate por la conversación.',
      });
      return null;
    }
    return doc;
  }

  async function run(kind: Exclude<Busy, null>, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    setFeedback(null);
    try {
      await fn();
    } catch (e) {
      setFeedback({ type: 'error', title: 'Algo ha fallado', detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const copy = (mode: 'copy' | 'ai') =>
    run(mode, async () => {
      setFallback(null);
      const doc = await extractDocument();
      if (!doc) return;
      const text = mode === 'ai' ? formatForAi(doc) : formatTxt(doc);
      const result = await writeClipboard(text);
      const n = doc.messages.length;
      if (result.ok) {
        setFeedback({
          type: 'success',
          title: `COPIADO CORRECTAMENTE — ${n} ${n === 1 ? 'MENSAJE' : 'MENSAJES'}`,
          detail: `${doc.chat.name} · ${doc.coverageText}${mode === 'ai' ? ' · con instrucciones para IA' : ''}${
            doc.coverage === 'loaded-only' ? '. Para incluir mensajes anteriores usa RECUPERAR HISTORIAL.' : ''
          }`,
        });
      } else {
        const header = (mode === 'ai' ? `${AI_INSTRUCTIONS}\n\n` : '') + formatHeader(doc).join('\n');
        setFallback({
          text,
          blocks: text.length > BLOCK_CHARS ? splitIntoBlocks(header, formatMessageBlocks(doc), BLOCK_CHARS, doc.chat.name) : [],
          filename: exportFilename(doc.chat.name, doc.exportedAt, 'txt'),
          reason: result.error,
        });
        setFeedback({ type: 'error', title: 'No se copió nada al portapapeles', detail: 'Usa la alternativa manual de abajo.' });
      }
    });

  const download = (ext: 'txt' | 'md' | 'json') =>
    run(ext, async () => {
      const doc = await extractDocument();
      if (!doc) return;
      const content = ext === 'txt' ? formatTxt(doc) : ext === 'md' ? formatMarkdown(doc) : formatJson(doc, VERSION);
      const filename = exportFilename(doc.chat.name, doc.exportedAt, ext);
      const r = await downloadText(content, filename, ext);
      setFeedback(
        r.ok
          ? { type: 'success', title: `Descarga iniciada — ${doc.messages.length} mensajes`, detail: filename }
          : { type: 'error', title: 'No se pudo descargar', detail: r.error },
      );
    });

  const downloadFallback = () => {
    if (!fallback) return;
    void downloadText(fallback.text, fallback.filename, 'txt').then((r) =>
      setFeedback(r.ok ? { type: 'success', title: 'Descarga iniciada', detail: fallback.filename } : { type: 'error', title: 'No se pudo descargar', detail: r.error }),
    );
  };

  const startHistory = () =>
    run('history', async () => {
      if (!ready) return;
      const targetDate = range.mode === 'loaded' || range.mode === 'all' ? null : rangeBounds(range, new Date()).from;
      const res = await sendToTab<SimpleResponse>(ready.tabId, { type: 'WAI_HISTORY_START', range, targetDate, settings });
      if (!res.ok) setFeedback({ type: 'error', title: 'No se pudo iniciar la recuperación', detail: res.error });
      await refresh(false);
    });

  const startZip = () =>
    run('zip', async () => {
      if (!ready) return;
      if (range.mode === 'custom' && !range.from && !range.to) {
        setFeedback({ type: 'error', title: 'Elige al menos una fecha', detail: 'Indica «Desde», «Hasta» o ambas para el rango personalizado.' });
        return;
      }
      const targetDate = range.mode === 'loaded' || range.mode === 'all' ? null : rangeBounds(range, new Date()).from;
      const res = await sendToTab<SimpleResponse>(ready.tabId, { type: 'WAI_ZIP_START', range, targetDate, settings });
      if (!res.ok) setFeedback({ type: 'error', title: 'No se pudo iniciar el ZIP', detail: res.error });
      else setFeedback({ type: 'info', title: 'Creando el ZIP para IA', detail: 'Puedes cerrar esta ventana: el ZIP se descargará solo al terminar. No cambies de chat mientras tanto.' });
      await refresh(false);
    });

  const cancelHistory = () =>
    run('cancel', async () => {
      if (!ready) return;
      await sendToTab<SimpleResponse>(ready.tabId, { type: 'WAI_HISTORY_CANCEL' });
      await refresh(false);
    });

  const clearChat = () =>
    run('clear-chat', async () => {
      if (!ready) return;
      await sendToTab<SimpleResponse>(ready.tabId, { type: 'WAI_CLEAR', all: false });
      setFeedback({ type: 'info', title: 'Datos temporales de este chat borrados' });
      await refresh(true);
    });

  const clearAll = () =>
    run('clear-all', async () => {
      if (ready) await sendToTab<SimpleResponse>(ready.tabId, { type: 'WAI_CLEAR', all: true }).catch(() => undefined);
      const r = await sendToBackground({ type: 'WAI_CP_CLEAR_ALL' });
      setFeedback(r.ok ? { type: 'info', title: 'Todos los datos temporales borrados' } : { type: 'error', title: 'No se pudo borrar', detail: r.error });
      await refresh(true);
    });

  const diagnostics = () =>
    run('diag', async () => {
      if (!ready) return;
      const r = await sendToTab<DiagnosticsResponse>(ready.tabId, { type: 'WAI_DIAGNOSTICS' });
      if (!r.ok) {
        setFeedback({ type: 'error', title: 'Diagnóstico no disponible', detail: r.error });
        return;
      }
      const c = await writeClipboard(JSON.stringify(r.diagnostics, null, 2));
      setFeedback(
        c.ok
          ? { type: 'success', title: 'Diagnóstico copiado', detail: 'Solo contiene contadores de selectores y nombres de iconos; ningún mensaje.' }
          : { type: 'error', title: 'No se pudo copiar el diagnóstico', detail: c.error },
      );
    });

  if (view === 'settings') {
    return (
      <main className="pb-1">
        <Header conn={conn} />
        <SettingsView
          settings={settings}
          onChange={updateSettings}
          onBack={() => setView('main')}
          onClearChat={clearChat}
          onClearAll={clearAll}
          onDiagnostics={diagnostics}
          connected={chat !== null}
          busy={busy}
        />
        {feedback ? (
          <div className="px-4 pb-4">
            <FeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} />
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="pb-1">
      <Header conn={conn} onSettings={() => setView('settings')} />
      <div className="space-y-3 px-4 pb-3">
        {conn.kind === 'loading' ? (
          <div className="space-y-3" aria-busy="true" aria-label="Conectando con WhatsApp Web">
            <div className="h-36 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
            <div className="h-12 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
          </div>
        ) : null}

        {conn.kind === 'no-tab' ? (
          <EmptyState
            icon={<Smartphone className="size-5" aria-hidden />}
            title="WhatsApp Web no está abierto"
            body="Abre web.whatsapp.com, selecciona una conversación y vuelve a pulsar el icono de la extensión."
            action={
              <Button variant="primary" className="h-9 w-full text-[13px]" icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => void chrome.tabs.create({ url: WA_ORIGIN })}>
                Abrir WhatsApp Web
              </Button>
            }
          />
        ) : null}

        {conn.kind === 'not-ready' ? (
          <EmptyState
            icon={<RefreshCw className="size-5" aria-hidden />}
            title="Recarga WhatsApp Web"
            body={`${conn.message} Recarga la pestaña para activarla; no se pierde nada de WhatsApp.`}
            action={
              <Button
                variant="primary"
                className="h-9 w-full text-[13px]"
                icon={<RefreshCw className="size-4" aria-hidden />}
                onClick={() => {
                  void chrome.tabs.reload(conn.tabId).then(() => setTimeout(() => void refresh(true), 2500));
                }}
              >
                Recargar pestaña de WhatsApp
              </Button>
            }
          />
        ) : null}

        {ready && !chat ? (
          <EmptyState
            icon={<MessageCircleOff className="size-5" aria-hidden />}
            title="Abre una conversación"
            body="Selecciona un chat en WhatsApp Web. Si acabas de abrirlo, espera a que termine de cargar."
            action={
              <Button className="h-9 w-full text-[13px]" icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void refresh(true)}>
                Volver a comprobar
              </Button>
            }
          />
        ) : null}

        {ready && chat ? (
          <>
            <ChatCard state={ready.state} background={ready.background} />
            <RangePicker value={range} onChange={setRange} disabled={busy !== null} />

            <Button
              variant="primary"
              data-testid="copy-button"
              className="h-12 w-full text-[14px] tracking-wide"
              onClick={() => void copy('copy')}
              loading={busy === 'copy'}
              disabled={busy !== null && busy !== 'copy'}
              icon={<Copy className="size-[18px]" aria-hidden />}
            >
              COPIAR CONVERSACIÓN
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                className="h-9 whitespace-nowrap px-2 text-[11.5px]"
                data-testid="copy-ai-button"
                onClick={() => void copy('ai')}
                loading={busy === 'ai'}
                disabled={busy !== null && busy !== 'ai'}
                icon={<Sparkles className="size-4 text-brand-600" aria-hidden />}
              >
                COPIAR PARA IA
              </Button>
              <Button
                className="h-9 whitespace-nowrap px-2 text-[11.5px]"
                data-testid="history-button"
                onClick={() => void startHistory()}
                loading={busy === 'history'}
                disabled={running || (busy !== null && busy !== 'history')}
                icon={<History className="size-4" aria-hidden />}
              >
                RECUPERAR HISTORIAL
              </Button>
            </div>

            <div>
              <Button
                className="h-10 w-full text-[12.5px]"
                data-testid="zip-button"
                onClick={() => void startZip()}
                loading={busy === 'zip'}
                disabled={running || (busy !== null && busy !== 'zip')}
                icon={<FileArchive className="size-4 text-brand-600" aria-hidden />}
              >
                ZIP PARA IA · texto, fotos, audios, vídeos y PDF
              </Button>
              <p className="mt-1 text-[10.5px] leading-snug text-zinc-500 dark:text-zinc-400">
                {range.mode === 'loaded'
                  ? 'Con «Cargados» solo entra la multimedia visible. Elige «Todo» o un rango para recorrer el chat.'
                  : 'Recorre el chat en el rango elegido y descarga cada archivo.'}{' '}
                Los audios se reproducen en silencio para guardarlos: los recibidos quedarán como escuchados.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Descargar</p>
              <div className="grid grid-cols-3 gap-2">
                {(['txt', 'md', 'json'] as const).map((ext) => (
                  <Button
                    key={ext}
                    variant="ghost"
                    data-testid={`download-${ext}`}
                    className="h-8 border border-dashed border-zinc-300 text-[11.5px] dark:border-zinc-700"
                    onClick={() => void download(ext)}
                    loading={busy === ext}
                    disabled={busy !== null && busy !== ext}
                    icon={<Download className="size-3.5" aria-hidden />}
                  >
                    {ext.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            {job ? <JobPanel job={job} onCancel={() => void cancelHistory()} cancelling={busy === 'cancel'} /> : null}
          </>
        ) : null}

        {feedback ? <FeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} /> : null}
        {fallback ? <FallbackPanel data={fallback} onDownload={downloadFallback} onClose={() => setFallback(null)} /> : null}
      </div>
      <footer className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 text-[10.5px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="size-3" aria-hidden /> Procesamiento local · sin envío de datos
        </span>
        <span>v{VERSION}</span>
      </footer>
    </main>
  );
}
