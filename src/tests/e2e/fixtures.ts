import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { installWhatsAppSim, type SimConfig } from '../fixtures/waSim';

const DIST = resolve(import.meta.dirname, '../../../dist');

/** Página en blanco que se sirve como https://web.whatsapp.com/ (nunca se contacta con WhatsApp). */
const BLANK = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>WhatsApp (simulado)</title></head><body></body></html>';

/**
 * Registra en la página del popup el último texto escrito en el portapapeles y
 * permite simular fallos. Solo actúa en páginas de la extensión.
 */
function clipboardProbe() {
  if (location.protocol !== 'chrome-extension:') return;
  const w = window as unknown as { __clip: { last: string | null; fail: boolean; calls: number } };
  w.__clip = { last: null, fail: sessionStorage.getItem('__clipFail') === '1', calls: 0 };
  const original = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = async (text: string) => {
    w.__clip.calls++;
    if (w.__clip.fail) throw new Error('NotAllowedError (simulado)');
    await original(text);
    w.__clip.last = text;
  };
  const exec = document.execCommand.bind(document);
  document.execCommand = (cmd: string, ...rest: unknown[]) => {
    if (w.__clip.fail && cmd === 'copy') return false;
    return exec(cmd, ...(rest as [boolean, string]));
  };
}

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, provide) => {
    if (!existsSync(resolve(DIST, 'manifest.json'))) throw new Error('Falta dist/: ejecuta npm run build antes de las pruebas E2E.');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    await context.route('https://web.whatsapp.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: BLANK }),
    );
    await context.addInitScript(clipboardProbe);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await provide(context);
    await context.close();
  },
  extensionId: async ({ context }, provide) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await provide(new URL(sw.url()).host);
  },
});

export { expect };

export async function installSim(page: Page, config: SimConfig): Promise<void> {
  await page.evaluate(installWhatsAppSim, config);
}

export async function openWhatsApp(context: BrowserContext, config?: SimConfig): Promise<Page> {
  const page = await context.newPage();
  await page.goto('https://web.whatsapp.com/');
  if (config) await installSim(page, config);
  return page;
}

export async function openPopup(context: BrowserContext, extensionId: string, opts: { breakClipboard?: boolean } = {}): Promise<Page> {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 760 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  if (opts.breakClipboard) {
    await popup.evaluate(() => sessionStorage.setItem('__clipFail', '1'));
    await popup.reload();
  }
  await popup.bringToFront();
  return popup;
}

/** Texto realmente escrito por la API del portapapeles (tras resolver la promesa). */
export async function lastClipboardText(popup: Page): Promise<string | null> {
  return popup.evaluate(() => (window as unknown as { __clip: { last: string | null } }).__clip.last);
}

export async function systemClipboard(popup: Page): Promise<string | null> {
  try {
    return await popup.evaluate(() => navigator.clipboard.readText());
  } catch {
    return null;
  }
}
