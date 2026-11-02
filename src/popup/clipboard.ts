/**
 * Escritura en el portapapeles desde el popup (página de la extensión, con
 * gesto del usuario y permiso clipboardWrite). Solo se informa de éxito cuando
 * la escritura se ha confirmado: promesa resuelta o execCommand === true.
 */

export type ClipboardResult = { ok: true; method: 'clipboard-api' | 'exec-command' } | { ok: false; error: string };

export interface ClipboardEnv {
  clipboard?: { writeText(text: string): Promise<void> } | undefined;
  document?: Document | undefined;
}

function execCommandCopy(text: string, doc: Document): boolean {
  const ta = doc.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  doc.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = doc.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    ta.remove();
  }
  return ok;
}

export async function writeClipboard(text: string, env?: ClipboardEnv): Promise<ClipboardResult> {
  const e: ClipboardEnv = env ?? {
    clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
    document: typeof document !== 'undefined' ? document : undefined,
  };
  let apiError = '';
  if (e.clipboard?.writeText) {
    try {
      await e.clipboard.writeText(text);
      return { ok: true, method: 'clipboard-api' };
    } catch (err) {
      apiError = err instanceof Error ? err.message : String(err);
    }
  }
  if (e.document) {
    if (execCommandCopy(text, e.document)) return { ok: true, method: 'exec-command' };
  }
  return { ok: false, error: apiError || 'El navegador no permitió escribir en el portapapeles.' };
}
