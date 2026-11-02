import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, installSim, openPopup, openWhatsApp, lastClipboardText, systemClipboard } from './fixtures';
import { generateMessages, individualChat, richConversation } from '../fixtures/generators';
import type { SimConfig } from '../fixtures/waSim';
import { installModernSim } from '../fixtures/waModern';
import { readZip } from '../fixtures/zipReader';

/** Las pruebas usan "hoy" real porque el content script interpreta HOY/AYER con la fecha del sistema. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftToToday(items: ReturnType<typeof generateMessages>): ReturnType<typeof generateMessages> {
  const last = items[items.length - 1]?.date;
  if (!last) return items;
  const delta = Math.round((new Date(today()).getTime() - new Date(last).getTime()) / 86_400_000);
  return items.map((m) => {
    const d = new Date(m.date);
    d.setDate(d.getDate() + delta);
    return { ...m, date: d.toISOString().slice(0, 10) };
  });
}

function chat(n: number, extra: Partial<SimConfig> = {}): SimConfig {
  return individualChat(shiftToToday(generateMessages(n)), { today: today(), ...extra });
}

test('sin WhatsApp Web abierto muestra cómo abrirlo', async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByText('WhatsApp Web no está abierto')).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Abrir WhatsApp Web' })).toBeVisible();
});

test('WhatsApp Web sin conversación abierta', async ({ context, extensionId }) => {
  await openWhatsApp(context);
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByText('Abre una conversación')).toBeVisible();
  await expect(popup.getByText('Sin chat abierto')).toBeVisible();
});

test('COPIAR CONVERSACIÓN copia la conversación con un clic', async ({ context, extensionId }) => {
  await openWhatsApp(context, individualChat(richConversation(), { today: today() }));
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId('chat-name')).toHaveText('Cliente Ficticio SL');
  await expect(popup.getByTestId('coverage')).toHaveText('Inicio aparente alcanzado');
  const t0 = Date.now();
  await popup.getByTestId('copy-button').click();
  await expect(popup.getByTestId('feedback-success')).toContainText('COPIADO CORRECTAMENTE — 15 MENSAJES');
  console.log(`[e2e] copia de 15 mensajes: ${Date.now() - t0} ms`);
  const text = await lastClipboardText(popup);
  expect(text).not.toBeNull();
  expect(text!).toContain('CONVERSACIÓN: Cliente Ficticio SL');
  expect(text!).toContain('MENSAJES RECUPERADOS: 15');
  expect(text!).toContain('COBERTURA: Inicio aparente alcanzado');
  expect(text!).toContain('[25/10/2026 10:34] CLIENTE:\nHola, necesitamos automatizar la gestión de facturas.');
  expect(text!).toContain('[25/10/2026 10:39] CLIENTE:\n[AUDIO: transcripción no disponible]');
  expect(text!).toContain('dos 😀🎉');
  const system = await systemClipboard(popup);
  // Windows guarda el texto del portapapeles con saltos CRLF.
  if (system !== null) expect(system.replace(/\r\n/g, '\n')).toBe(text);
  console.log(`[e2e] lectura del portapapeles del sistema: ${system === null ? 'no permitida en este entorno' : 'coincide'}`);
});

test('COPIAR PARA IA añade las instrucciones del expediente', async ({ context, extensionId }) => {
  await openWhatsApp(context, individualChat(richConversation(), { today: today() }));
  const popup = await openPopup(context, extensionId);
  await popup.getByTestId('copy-ai-button').click();
  await expect(popup.getByTestId('feedback-success')).toContainText('COPIADO CORRECTAMENTE');
  const text = (await lastClipboardText(popup))!;
  expect(text.startsWith('Analiza la conversación comercial y crea un expediente estructurado.')).toBe(true);
  expect(text).toContain('18. Briefing para el equipo técnico.');
  expect(text).toContain('===== INICIO DE LA CONVERSACIÓN =====');
});

test('descargas TXT, MD y JSON reales', async ({ context, extensionId }) => {
  await openWhatsApp(context, individualChat(richConversation(), { today: today() }));
  const popup = await openPopup(context, extensionId);
  for (const ext of ['txt', 'md', 'json'] as const) {
    await popup.getByTestId(`download-${ext}`).click();
    await expect(popup.getByTestId('feedback-success')).toContainText('Descarga iniciada — 15 mensajes');
    await expect(popup.getByTestId('feedback-success')).toContainText(`.${ext}`);
  }
  // Playwright guarda las descargas con nombre GUID: se verifica el contenido real de los archivos.
  let paths: string[] = [];
  await expect
    .poll(async () => {
      paths = await popup.evaluate(async () =>
        (await chrome.downloads.search({})).filter((d) => d.state === 'complete' && d.fileSize > 0).map((d) => d.filename),
      );
      return paths.length;
    })
    .toBe(3);
  const contents = paths.map((p) => readFileSync(p, 'utf8'));
  const txt = contents.find((c) => c.startsWith('CONVERSACIÓN: Cliente Ficticio SL'));
  const md = contents.find((c) => c.startsWith('# Conversación de WhatsApp: Cliente Ficticio SL'));
  const json = contents.find((c) => c.trimStart().startsWith('{'));
  expect(txt).toContain('[25/10/2026 10:34] CLIENTE:\nHola, necesitamos automatizar la gestión de facturas.');
  expect(md).toContain('**[25/10/2026 10:34] CLIENTE:**');
  const parsed = JSON.parse(json!);
  expect(parsed).toMatchObject({ schemaVersion: '1.0.0', chat: { name: 'Cliente Ficticio SL', isGroup: false }, totals: { exported: 15 } });
  expect(parsed.messages[1]).toMatchObject({ direction: 'in', date: '2026-10-25', time: '10:34', type: 'text' });
});

test('RECUPERAR HISTORIAL recupera mensajes virtualizados hasta el inicio', async ({ context, extensionId }) => {
  await openWhatsApp(context, chat(600, { initialWindow: 40, pageSize: 60, virtualizeMax: 150, loadDelayMs: 80 }));
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId('coverage')).toHaveText('Solo mensajes cargados');
  await popup.getByTestId('history-button').click();
  await expect(popup.getByTestId('job-message')).toContainText('Inicio aparente del chat alcanzado', { timeout: 90_000 });
  await expect(popup.getByTestId('coverage')).toHaveText('Inicio aparente alcanzado');
  await expect(popup.getByTestId('stored-count')).toHaveText('601');
  await popup.getByTestId('copy-button').click();
  await expect(popup.getByTestId('feedback-success')).toContainText('COPIADO CORRECTAMENTE — 601 MENSAJES');
  const text = (await lastClipboardText(popup))!;
  for (const i of [1, 2, 300, 599, 600]) expect(text).toContain(`#${i}\n`);
  expect(text.match(/#\d+\n/g)).toHaveLength(600);
});

test('cancelar conserva lo capturado y se puede copiar', async ({ context, extensionId }) => {
  await openWhatsApp(context, chat(3000, { initialWindow: 40, pageSize: 30, loadDelayMs: 300 }));
  const popup = await openPopup(context, extensionId);
  await popup.getByTestId('history-button').click();
  await expect(popup.getByText('Cancelar (se conserva lo capturado)')).toBeVisible();
  await expect.poll(async () => Number((await popup.getByTestId('job-captured').textContent())?.replace(/\D/g, '')), { timeout: 30_000 }).toBeGreaterThan(100);
  await popup.getByText('Cancelar (se conserva lo capturado)').click();
  await expect(popup.getByTestId('job-message')).toContainText('Cancelado');
  await expect(popup.getByTestId('coverage')).toHaveText('Recuperación parcial');
  await popup.getByTestId('copy-button').click();
  await expect(popup.getByTestId('feedback-success')).toContainText('COPIADO CORRECTAMENTE');
  const text = (await lastClipboardText(popup))!;
  expect(text).toContain('COBERTURA: Recuperación parcial');
  expect(text).toContain('La recuperación del historial no llegó al inicio del chat');
});

test('cerrar y reabrir el popup no interrumpe la recuperación', async ({ context, extensionId }) => {
  await openWhatsApp(context, chat(400, { initialWindow: 40, pageSize: 40, loadDelayMs: 150 }));
  let popup = await openPopup(context, extensionId);
  await popup.getByTestId('history-button').click();
  await expect(popup.getByText('Recuperando', { exact: true })).toBeVisible();
  await popup.close();
  await new Promise((r) => setTimeout(r, 1500));
  popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId('job-message')).toContainText('Inicio aparente del chat alcanzado', { timeout: 60_000 });
  await expect(popup.getByTestId('stored-count')).toHaveText('401');
});

test('cambiar de chat durante la recuperación detiene y no mezcla', async ({ context, extensionId }) => {
  const wa = await openWhatsApp(context, chat(2000, { initialWindow: 40, pageSize: 30, loadDelayMs: 250 }));
  const popup = await openPopup(context, extensionId);
  await popup.getByTestId('history-button').click();
  await expect.poll(async () => Number((await popup.getByTestId('job-captured').textContent())?.replace(/\D/g, '')), { timeout: 30_000 }).toBeGreaterThan(60);
  const other: SimConfig = {
    chatName: 'Otro Chat Ficticio',
    chatJid: '34699999999@c.us',
    items: shiftToToday(generateMessages(25, { seed: 4 })).map((m) => ({ ...m, text: `OTRO ${m.text}` })),
    today: today(),
  };
  await wa.evaluate((cfg) => (window as unknown as { __waSim: { switchChat(c: unknown): void } }).__waSim.switchChat(cfg), other);
  await expect(popup.getByTestId('chat-name')).toHaveText('Otro Chat Ficticio', { timeout: 20_000 });
  await popup.getByTestId('copy-button').click();
  await expect(popup.getByTestId('feedback-success')).toContainText('COPIADO CORRECTAMENTE — 26 MENSAJES');
  const text = (await lastClipboardText(popup))!;
  expect(text).toContain('CONVERSACIÓN: Otro Chat Ficticio');
  expect(text.match(/^OTRO /gm)).toHaveLength(25);
  // Cada mensaje acaba en "#n": si se hubiera colado algo del primer chat habría más de 25.
  expect(text.match(/#\d+\n/g)).toHaveLength(25);
});

test('fallo del portapapeles: alternativa manual, partes y descarga', async ({ context, extensionId }) => {
  await openWhatsApp(context, chat(3000));
  const popup = await openPopup(context, extensionId, { breakClipboard: true });
  await popup.getByTestId('copy-button').click();
  await expect(popup.getByTestId('feedback-error')).toContainText('No se copió nada al portapapeles');
  await expect(popup.getByText('No se pudo copiar al portapapeles')).toBeVisible();
  const value = await popup.getByTestId('fallback-text').inputValue();
  expect(value).toContain('MENSAJES RECUPERADOS: 3001');
  expect(value.match(/#\d+\n/g)).toHaveLength(3000);
  await expect(popup.getByRole('button', { name: /Parte 1\/\d+/ })).toBeVisible();
  expect(await lastClipboardText(popup)).toBeNull();
  await expect(popup.getByTestId('feedback-success')).toHaveCount(0);
});

test('recargar WhatsApp restaura la copia temporal de la sesión', async ({ context, extensionId }) => {
  const items = shiftToToday(generateMessages(200));
  const wa = await openWhatsApp(context, individualChat(items, { today: today(), initialWindow: 200 }));
  let popup = await openPopup(context, extensionId);
  await popup.getByTestId('copy-button').click();
  await expect(popup.getByTestId('feedback-success')).toContainText('201 MENSAJES');
  await popup.close();
  await wa.reload();
  await installSim(wa, individualChat(items, { today: today(), initialWindow: 30 }));
  popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId('stored-count')).toHaveText('201');
  await popup.getByTestId('copy-button').click();
  await expect(popup.getByTestId('feedback-success')).toContainText('201 MENSAJES');
});

test('rango últimos 7 días filtra y lo indica en la cabecera', async ({ context, extensionId }) => {
  await openWhatsApp(context, individualChat(shiftToToday(generateMessages(240, { perDay: 12 })), { today: today(), initialWindow: 240 }));
  const popup = await openPopup(context, extensionId);
  await popup.getByRole('radio', { name: '7 días' }).click();
  await popup.getByTestId('copy-button').click();
  await expect(popup.getByTestId('feedback-success')).toContainText('COPIADO CORRECTAMENTE — 84 MENSAJES');
  const text = (await lastClipboardText(popup))!;
  expect(text).toContain('FILTRO: Últimos 7 días');
});

test('capturas del popup (claro y oscuro) para la documentación', async ({ context, extensionId }) => {
  await openWhatsApp(context, chat(600, { initialWindow: 40, pageSize: 60, loadDelayMs: 400 }));
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId('chat-name')).toHaveText('Cliente Ficticio SL');
  await popup.getByTestId('copy-button').click();
  await expect(popup.getByTestId('feedback-success')).toBeVisible();
  const dir = resolve(import.meta.dirname, '../../../docs/capturas');
  await popup.emulateMedia({ colorScheme: 'light' });
  await popup.mouse.move(0, 0);
  await popup.waitForTimeout(400); // fin de las transiciones de color
  await popup.screenshot({ path: resolve(dir, 'popup-claro.png'), fullPage: true });
  await popup.getByTestId('history-button').click();
  await expect(popup.getByText('Recuperando', { exact: true })).toBeVisible();
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.mouse.move(0, 0);
  await popup.waitForTimeout(400);
  await popup.screenshot({ path: resolve(dir, 'popup-oscuro-historial.png'), fullPage: true });
});

test('rendimiento: 5000 mensajes cargados en Chrome real', async ({ context, extensionId }) => {
  await openWhatsApp(context, chat(5000, { initialWindow: 5000 }));
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId('stored-count')).toHaveText('5001', { timeout: 60_000 });
  const t0 = Date.now();
  await popup.getByTestId('copy-button').click();
  await expect(popup.getByTestId('feedback-success')).toContainText('COPIADO CORRECTAMENTE — 5001 MENSAJES', { timeout: 60_000 });
  const ms = Date.now() - t0;
  const text = (await lastClipboardText(popup))!;
  console.log(`[e2e] copia de 5001 mensajes: ${ms} ms · ${(text.length / 1024).toFixed(0)} KB`);
  expect(ms).toBeLessThan(15_000);
});

test('ZIP PARA IA: DOM actual de WhatsApp con foto, nota de voz, vídeo y PDF reales en el navegador', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('https://web.whatsapp.com/');
  await page.evaluate(installModernSim, { realMedia: true });
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId('chat-name')).toHaveText('Cliente Moderno SL');
  const otherDownloads: string[] = [];
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  page.on('download', (d) => {
    if (!d.suggestedFilename().endsWith('.zip')) otherDownloads.push(d.suggestedFilename());
  });
  await popup.getByTestId('zip-button').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^whatsapp_cliente-moderno-sl_\d{4}-\d{2}-\d{2}_\d{4}\.zip$/);
  const entries = readZip(new Uint8Array(readFileSync((await download.path())!)));
  const paths = entries.map((e) => e.path);
  expect(paths).toEqual([
    'LEEME.txt',
    'PARA_LA_IA.txt',
    'conversacion.txt',
    'conversacion.json',
    'media/0003_2026-10-25_1002_cliente_foto.png',
    'media/0004_2026-10-25_1003_cliente_audio.ogg',
    'media/0005_2026-10-25_1004_empresa_video.mp4',
    'media/0007_2026-10-25_1006_cliente_documento_presupuesto-octubre.pdf',
  ]);
  const size = (p: string) => entries.find((e) => e.path === p)!.data.length;
  // La foto es la versión completa del visor (20 000 bytes), no la miniatura (800).
  expect(size('media/0003_2026-10-25_1002_cliente_foto.png')).toBe(20_000);
  expect(size('media/0004_2026-10-25_1003_cliente_audio.ogg')).toBe(5_000);
  expect(size('media/0005_2026-10-25_1004_empresa_video.mp4')).toBe(30_000);
  expect(size('media/0007_2026-10-25_1006_cliente_documento_presupuesto-octubre.pdf')).toBe(12_345);
  const txt = new TextDecoder().decode(entries.find((e) => e.path === 'conversacion.txt')!.data);
  expect(txt).toContain('MENSAJES RECUPERADOS: 7');
  expect(txt).toContain('[25/10/2026 10:00] CLIENTE:\nHola, os paso la factura');
  expect(txt).toContain('[25/10/2026 10:01] EMPRESA:\nRecibido, gracias');
  expect(txt).toContain('[ARCHIVO ADJUNTO EN EL ZIP: media/0005_2026-10-25_1004_empresa_video.mp4]');
  // El visor se cerró y nada quedó silenciado ni abierto.
  await expect(page.locator('#sim-viewer')).toHaveCount(0);
  await expect(popup.getByTestId('job-message')).toContainText('ZIP descargado');
  await expect(popup.getByTestId('job-media')).toContainText('1 fotos · 1 vídeos · 1 audios · 1 documentos');
  // El documento entró en el ZIP sin descargarse aparte en la carpeta de Descargas.
  expect(otherDownloads).toEqual([]);
});
