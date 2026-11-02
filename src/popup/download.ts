/** Descarga local mediante chrome.downloads (sin servidores). */

export type DownloadResult = { ok: true; id: number } | { ok: false; error: string };

const MIME: Record<'txt' | 'md' | 'json', string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
};

export async function downloadText(content: string, filename: string, ext: 'txt' | 'md' | 'json'): Promise<DownloadResult> {
  const blob = new Blob([content], { type: `${MIME[ext]};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  try {
    const id = await chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' });
    if (typeof id !== 'number') throw new Error(chrome.runtime.lastError?.message ?? 'La descarga no se inició.');
    const revoke = () => {
      URL.revokeObjectURL(url);
      chrome.downloads.onChanged.removeListener(onChanged);
    };
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id === id && delta.state && delta.state.current !== 'in_progress') revoke();
    };
    chrome.downloads.onChanged.addListener(onChanged);
    setTimeout(revoke, 60_000);
    return { ok: true, id };
  } catch (e) {
    URL.revokeObjectURL(url);
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo iniciar la descarga.' };
  }
}
