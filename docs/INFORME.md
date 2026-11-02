# Informe de entrega — WhatsApp Intelligence v1.2.0

## Novedades v1.2.0 (02/11/2026)

- El ZIP PARA IA incluye también los **documentos** (PDF, Word, Excel…) con su nombre original: `media/0007_<fecha>_<hora>_cliente_documento_presupuesto.pdf`.
- Detección: por el nombre del icono o, si WhatsApp lo cambia, porque la burbuja solo muestra un nombre de archivo.
- Captura: pulsa el botón Descargar del documento. Si WhatsApp abre una vista previa, usa su propio botón Descargar y la cierra. `page-hook.js` intercepta el enlace `blob:` de descarga (o la ventana nueva) solo mientras está activo, así que el archivo no se descarga además en Descargas.
- **No verificado en real:** cómo muestra WhatsApp Web los documentos hoy. No abrí tu WhatsApp para no cortar el ZIP que tenías en marcha. Se probó con el simulador (E2E: PDF de 12 345 bytes dentro del ZIP y ninguna otra descarga).

# Informe de entrega — WhatsApp Intelligence v1.1.0

## Novedades v1.1.0 (02/11/2026)

**Motivo:** con WhatsApp Web real solo recuperaba 24 «mensajes», todos sin fecha. Revisé la estructura del WhatsApp Web actual en el Chrome del usuario, sin leer textos ni nombres, y había cambiado:

- `data-id` es ahora un id opaco (`3EB0…`), sin `true_/false_` ni JID.
- No existen las clases `message-in`/`message-out`. La burbuja es `data-testid="msg-container"`.
- Los iconos son `<title>` dentro del SVG (`wds-ic-read`, `ic-keyboard-voice-filled`, `ic-videocam-filled`).
- Arriba del todo aparece el aviso «Usa WhatsApp en tu teléfono para ver mensajes anteriores al …».

**Cambios:**

- Lector adaptado al DOM actual sin perder el antiguo:
  - Dirección por iconos de estado de entrega (solo los llevan los mensajes propios), por la etiqueta «Tú:» o por la posición de la burbuja.
  - Hora tomada del pie de la burbuja y autor visible en grupos.
  - Las filas aún no pintadas se ignoran.
- En el Chrome real, haciendo scroll, el historial cargó más de 220 mensajes únicos en 12 pasos. La extensión antes los leía mal.
- Nuevo botón **ZIP PARA IA**: recupera el rango elegido y descarga fotos, notas de voz y vídeos. El ZIP contiene `LEEME.txt`, `PARA_LA_IA.txt`, `conversacion.txt`, `conversacion.json` y la carpeta `media/`, y cada mensaje indica su archivo. Ver [PRIVACIDAD.md](PRIVACIDAD.md).
- Verificado en el WhatsApp real (pestaña de prueba):
  - Al abrir un vídeo o reproducir una nota de voz, WhatsApp crea un Blob con `URL.createObjectURL` (32 KB el audio, 2 MB el vídeo).
  - La miniatura de una foto se puede leer como Blob.
- **No verificado en real:** el ciclo completo del botón ZIP con la extensión instalada. Se probó de punta a punta con el simulador del DOM actual en Chromium (E2E 15).

Pruebas v1.1.0: `npm run typecheck` OK · `npm run lint` OK · `npm test` 100/100 · `npm run test:e2e` 15/15.
La primera ejecución E2E tras compilar falló una vez: el popup no conectó en 8 s mientras arrancaba Chromium. Al repetirla pasó, y también en la batería completa.

---

# Informe de entrega — WhatsApp Intelligence v1.0.0

Fecha: 02/11/2026. Entorno: Windows 11, Node 24.14.1, npm 11.11.0, Chromium de Playwright 156.0.8078.4 (v1248).

## Resumen honesto

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| 1. Instalable con «Cargar descomprimida» | Verificado en Chromium automatizado | Playwright carga `dist/` con `--load-extension` y usa popup, content script y service worker reales |
| 2. Detecta la pestaña y el chat | Verificado con simulador | E2E: sin pestaña, sin chat, chat activo, pestaña en segundo plano |
| 3. Copia con un clic | Verificado con simulador | E2E: `COPIADO CORRECTAMENTE — 15 MENSAJES`; contenido comprobado |
| 4. Pegar inmediatamente | Verificado | E2E lee el **portapapeles real de Windows** tras la copia y coincide (Windows usa CRLF) |
| 5. Contenido, remitentes, orden y fechas | Verificado con simulador | Unit + E2E: emojis, multilínea, enlaces, citas, editados, reenviados, multimedia, grupos, 12 h/24 h, DMY/MDY |
| 6. Informa de historial incompleto | Verificado | Cobertura y advertencias en cabecera y popup; nunca «completo» sin evidencia |
| 7. Recupera mensajes antiguos con scroll | Verificado con simulador | E2E: 600 mensajes con virtualización → 601 (incluye aviso de cifrado); unit: 1000 mensajes |
| 8. No mezcla chats | Verificado con simulador | Unit + E2E: cambio de chat a mitad de recuperación; filas de otro chat descartadas |
| 9. Cancelar sin perder lo capturado | Verificado | Unit + E2E |
| 10. Descarga TXT, MD y JSON | Verificado | E2E lee los tres archivos descargados y valida su contenido |
| 11. No envía datos a terceros | Verificado por diseño y revisión | Sin `fetch`/XHR en el código, CSP `connect-src 'none'`, único host `web.whatsapp.com` |
| 12. Compila sin errores | Verificado | `npm run build` |
| 13. Lint, typecheck y pruebas | Verificado | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` |
| 14. Informe de resultados reales | Este documento | — |

**No verificado: el funcionamiento sobre WhatsApp Web real.** Todas las pruebas usan un simulador que reproduce la estructura pública conocida del DOM de WhatsApp Web. Los selectores pueden no coincidir con la versión actual de WhatsApp. Validación pendiente: [VALIDACION-MANUAL.md](VALIDACION-MANUAL.md).

## Comandos ejecutados y resultados

```
npm install                      → OK (dependencias: react, react-dom, lucide-react, @fontsource-variable/inter)
npx playwright install chromium  → OK (Chromium v1248; el Chrome de marca ignora --load-extension desde la v137)
npm run build                    → OK · dist/content.js 29,9 KB · dist/background.js 3,0 KB · popup 268 KB (84 KB gzip)
npm run typecheck                → OK, 0 errores (TypeScript 5.9 en modo estricto + noUncheckedIndexedAccess)
npm run lint                     → OK, 0 problemas
npm test                         → 7 archivos, 94 pruebas superadas
npm run test:e2e                 → 14 pruebas superadas
```

### Pruebas unitarias (Vitest, 94)

- `dates.test.ts`: horas 12/24 h (con espacios duros), atributo de copia en varios formatos, deducción del orden día/mes, HOY/AYER/día de la semana/fechas textuales, fechas sin año marcadas como deducidas.
- `extraction.test.ts`: texto visible sin HTML (emojis, `<br>`, enlaces, botones y ocultos excluidos), contenido malicioso tratado como texto, identidad del chat, conversación rica con todos los tipos, grupos con participantes, inglés 12 h MDY, descarte de filas de otro chat, banner de no leídos, botón de sincronizar con el teléfono, filas sin `data-id` y diagnóstico sin contenido.
- `merge.test.ts`: lotes solapados, 1000 mensajes con ventanas virtualizadas aleatorias reconstruidos exactamente, textos idénticos conservados, huellas estables, emparejamiento con ancla distinta, detección de huecos, nunca se elimina nada.
- `export.test.ts`: formato TXT exacto del enunciado, indicadores de ausencia, modo nombres, rangos 7/30/personalizado con mensajes sin fecha, Markdown neutralizado, JSON versionado sin teléfono, Copiar para IA, bloques sin pérdida y nombres de archivo seguros.
- `history.test.ts` (driver DOM real sobre jsdom + simulador con carga perezosa): 1000 mensajes con virtualización hasta el inicio, scroll que no progresa, fin sin evidencia de inicio, sincronización con el teléfono, cancelación, cambio de chat, fecha objetivo, límite de mensajes y reanudación desde checkpoint sin duplicar.
- `storage-clipboard-audio.test.ts`: checkpoints (aislamiento por chat, TTL, cuota, error de escritura), restauración de una recuperación interrumpida, ajustes, portapapeles (éxito, alternativa y fallo total sin éxito ficticio), audio (V1 sin transcripción y consentimiento obligatorio para proveedores remotos), protocolo.
- `performance.test.ts`: 0, 1, 100, 1000 y 5000 mensajes.

### Pruebas E2E (Playwright, 14)

Extensión real en Chromium. `https://web.whatsapp.com/` se sirve en local por intercepción de red con el simulador: **nunca se contacta con WhatsApp**.

1. Sin WhatsApp Web abierto → estado vacío con botón para abrirlo.
2. WhatsApp sin conversación → «Abre una conversación».
3. COPIAR CONVERSACIÓN → éxito con recuento y portapapeles del sistema idéntico al texto generado.
4. COPIAR PARA IA → instrucciones + conversación.
5. Descargas TXT, MD y JSON → archivos leídos de disco y validados.
6. RECUPERAR HISTORIAL con virtualización → 600/600 mensajes, «Inicio aparente alcanzado».
7. Cancelar → «Recuperación parcial», lo capturado se copia.
8. Cerrar y reabrir el popup durante la recuperación → continúa y termina.
9. Cambio de chat durante la recuperación → se detiene; la copia contiene solo el chat nuevo.
10. Fallo del portapapeles → sin éxito ficticio; texto manual, partes numeradas y descarga.
11. Recarga de WhatsApp → se restaura la copia temporal de la sesión (201 mensajes con solo 30 en pantalla).
12. Rango «Últimos 7 días» → filtra y lo indica en la cabecera.
13. Capturas del popup (claro y oscuro).
14. Rendimiento con 5000 mensajes en Chrome real.

## Rendimiento medido

Chromium real (E2E, ejecución final):

| Caso | Tiempo clic → «COPIADO CORRECTAMENTE» |
| --- | --- |
| 15 mensajes | 108–147 ms |
| 5001 mensajes (326 KB de texto) | 1,5–2,6 s (varía entre ejecuciones) |

El objetivo de 1–3 s para chats habituales ya cargados se cumple en el simulador. En WhatsApp real dependerá de su DOM.

jsdom (unitarias; jsdom es mucho más lento que Chrome con selectores):

| Mensajes | Leer DOM | Normalizar + deduplicar | TXT + JSON |
| --- | --- | --- | --- |
| 100 | ~0,2 s | 1 ms | 1 ms |
| 1000 | ~2,2 s | 20 ms | 14 ms |
| 5000 | ~43 s | 55 ms | 46 ms |

Toda la lógica propia (normalización, deduplicación y formato) es lineal y tarda milisegundos. El coste en jsdom viene de su motor de selectores: se midió que el coste por fila es constante.

## Supuestos

- La estructura de WhatsApp Web incluye `#main`, `data-id` con forma `true|false_<jid>_<id>[_<participante>]`, burbujas `.message-in`/`.message-out`, `data-pre-plain-text="[hora, fecha] Nombre: "` y `span.selectable-text`. Si alguna señal falta hay alternativas (burbujas sin id → huella; chat sin JID → título; fecha sin atributo → separador de día + hora visible), pero hay que confirmarlo en real.
- El aviso «Los mensajes y las llamadas están cifrados de extremo a extremo» aparece al principio del historial y se usa como evidencia de inicio.
- WhatsApp carga mensajes antiguos al llegar al tope del contenedor desplazable.
- «HOY», «AYER» y los días de la semana se resuelven respecto a la fecha del equipo, igual que hace WhatsApp.

## Limitaciones conocidas

- **Sin validar en WhatsApp Web real** (ver arriba).
- **Mensajes largos con «Leer más»**: WhatsApp no pone el texto completo en el DOM hasta pulsar. La extensión no pulsa nada: marca el mensaje como recortado y lo avisa.
- **Historial solo en el móvil**: si WhatsApp muestra «obtener mensajes anteriores de tu teléfono», la recuperación se detiene y lo indica. La extensión no pulsa ese botón.
- **Pestaña en segundo plano**: Chrome ralentiza los temporizadores y la recuperación va más lenta. El popup lo avisa.
- **Orden día/mes ambiguo**: si ninguna fecha del chat tiene un número mayor que 12, el orden se deduce del idioma y las fechas se marcan como «fecha deducida». Si más tarde aparece una fecha que lo resuelve, se corrigen las guardadas.
- **Remitentes en grupos**: los mensajes sin atributo de copia (audios, imágenes…) toman el nombre del mismo participante si apareció antes en el chat; si no, `REMITENTE DESCONOCIDO`.
- **Duración de los audios**: no se incluye (no se pudo identificar de forma fiable sin inventarla).
- **Transcripción de audio**: no incluida en la V1; solo la interfaz de proveedor (`src/audio/provider.ts`).
- **Cuota de la copia temporal**: `chrome.storage.session` admite unos 10 MB (del orden de 25.000–30.000 mensajes). Si se supera, se avisa y los datos siguen en memoria mientras no se recargue la pestaña.
- **Mensajes del sistema sin fecha** (p. ej. el aviso de cifrado) salen con `FECHA NO DISPONIBLE`. Se pueden ocultar en Ajustes.
- **Las pruebas E2E escriben en el portapapeles real** del equipo donde se ejecutan.

## Problemas conocidos de la entrega

1. `eslint.config.js` tenía un valor inválido (`'no-console': ['error', { allow: [] }]`). Se corrigió a `'no-console': 'error'`, que es equivalente, con autorización expresa del usuario porque el hook `config-protection` del plugin ECC bloquea editar ese archivo.
2. La captura de pantalla del modo oscuro puede salir con algún botón a medio cambiar de color si se toma justo al cambiar de tema. El estilo final en el navegador es correcto (se comprobó con `getComputedStyle`).

## Revisión de seguridad realizada

- Sin `innerHTML`/`outerHTML` en el código propio (lo prohíbe una regla de lint) ni `dangerouslySetInnerHTML`. El bundle de React contiene referencias internas a `innerHTML` que solo se activan con `dangerouslySetInnerHTML`, que no se usa. El texto de los mensajes solo se lee con `textContent`/`nodeValue`/atributos y React lo renderiza como texto. Auditoría de `src/` y `dist/`: ninguna llamada a `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval` ni `new Function`.
- El Markdown exportado escapa `<`, `>`, `&` y la sintaxis al inicio de línea.
- El content script solo acepta mensajes de la propia extensión (`sender.id` igual y sin pestaña de origen). El service worker solo acepta mensajes de la propia extensión desde `web.whatsapp.com` o de sus páginas.
- No hay peticiones de red, telemetría, código remoto ni secretos. CSP: `script-src 'self'; object-src 'none'; base-uri 'none'; connect-src 'none'; frame-ancestors 'none'`.
- No se accede a IndexedDB/localStorage de WhatsApp, tokens, claves, protocolos ni APIs internas: solo al DOM visible.
- En producción no se registra nada en consola (`src/shared/log.ts` solo actúa en desarrollo y nunca recibe contenido).
