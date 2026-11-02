# Validación manual en WhatsApp Web real (PENDIENTE)

Las pruebas automáticas usan un simulador. Esta guía comprueba la extensión contra WhatsApp Web real. Hazla con un chat **de prueba o propio**, no con datos de clientes, y anota el resultado de cada paso.

## 0. Preparación

1. `npm run build` (o usa la carpeta `dist/` entregada).
2. `chrome://extensions` → Modo de desarrollador → **Cargar descomprimida** → `dist`.
3. Abre `https://web.whatsapp.com`, inicia sesión y **recarga la pestaña** (F5).
4. Crea o elige un chat de prueba con: varios mensajes de texto, un emoji, un mensaje multilínea, un enlace, una respuesta citada, un mensaje editado, un audio, una imagen con pie, un documento PDF y un mensaje eliminado.

## 1. Diagnóstico de selectores (sin contenido)

1. Abre el chat de prueba → icono de la extensión → **engranaje** → **Copiar diagnóstico de selectores (sin contenido)**.
2. Pega el resultado en un editor. Solo contiene contadores y nombres de iconos de interfaz. Comprueba:
   - `mainFound: true`, `titleFound: true`, `scrollContainerFound: true`.
   - `messageElements` > 0 y parecido al número de burbujas visibles.
   - `withPrePlainText` > 0 (si es 0, las fechas saldrán solo de los separadores de día).
   - `incoming` y `outgoing` > 0.
3. Si algo sale a 0, envía el diagnóstico al equipo técnico: hay que ajustar `src/adapters/whatsapp/selectors.ts`.

## 2. Copia rápida

| Paso | Resultado esperado | OK |
| --- | --- | --- |
| Abrir el popup con el chat abierto | Nombre del chat correcto, «Conectado», mensajes detectados > 0, cobertura «Solo mensajes cargados» (o «Inicio aparente» si el chat es corto) | ☐ |
| Pulsar COPIAR CONVERSACIÓN | «COPIADO CORRECTAMENTE — N MENSAJES» en 1–3 s | ☐ |
| Pegar en un editor | Cabecera completa y mensajes en orden antiguo → reciente | ☐ |
| Fechas y horas | Coinciden con las de WhatsApp (revisa al menos 5 mensajes) | ☐ |
| Remitentes | CLIENTE / EMPRESA correctos (o nombres en grupos) | ☐ |
| Emojis, multilínea, enlaces | Idénticos a WhatsApp | ☐ |
| Cita | Línea `> Respondiendo a …` con el texto citado, sin duplicarlo en el cuerpo | ☐ |
| Editado / eliminado | `(editado)` / `[MENSAJE ELIMINADO]` | ☐ |
| Audio | `[AUDIO: transcripción no disponible]` en su posición | ☐ |
| Imagen con pie / PDF | `[IMAGEN]` + pie / `[DOCUMENTO: nombre.pdf]` | ☐ |
| Texto de botones o menús | No aparece «Leer más», «Responder», horas sueltas ni checks | ☐ |
| Dos mensajes idénticos seguidos («Ok», «Ok») | Aparecen los dos | ☐ |

## 3. Recuperar historial

| Paso | Resultado esperado | OK |
| --- | --- | --- |
| En un chat largo pulsar RECUPERAR HISTORIAL | El chat se desplaza solo hacia arriba; el contador «Capturados» sube | ☐ |
| Esperar al final | Mensaje de parada claro: inicio alcanzado, sin progreso, sincronizar con el teléfono o límite | ☐ |
| Cobertura | «Inicio aparente alcanzado» solo si llegó al aviso de cifrado; si no, «Recuperación parcial» | ☐ |
| Copiar | Incluye los mensajes antiguos sin duplicados ni huecos (compara inicio y final con WhatsApp) | ☐ |
| Cancelar a mitad (otra prueba) | Se detiene; lo capturado se copia | ☐ |
| Cerrar el popup durante la recuperación y reabrirlo | El progreso continúa | ☐ |
| Cambiar de chat durante la recuperación | Se detiene y la copia del chat nuevo no contiene mensajes del anterior | ☐ |
| Rango «7 días» + RECUPERAR | Para al pasar la fecha de hace 7 días; la copia indica `FILTRO: Últimos 7 días` | ☐ |

## 4. Exportaciones y fallos

| Paso | Resultado esperado | OK |
| --- | --- | --- |
| DESCARGAR TXT / MD / JSON | Tres archivos `whatsapp_<chat>_<fecha>.<ext>` en Descargas, abren bien, con acentos y emojis | ☐ |
| COPIAR PARA IA y pegar en Claude/ChatGPT | Instrucciones + conversación; la IA genera el expediente | ☐ |
| Recargar WhatsApp tras copiar y reabrir el popup | «Mensajes detectados» conserva lo capturado (copia temporal) | ☐ |
| Ajustes → Borrar datos de este chat | El recuento vuelve a lo visible en pantalla | ☐ |
| Cerrar Chrome y volver a abrir | No queda ninguna copia temporal | ☐ |

## 5. Grupos

Repite el apartado 2 en un grupo de prueba: los nombres de los participantes visibles deben aparecer; los audios e imágenes de un participante que ya habló antes deben llevar su nombre; si no se puede saber, `REMITENTE DESCONOCIDO`.

## Si algo falla

Anota: versión de Chrome, idioma de WhatsApp, paso, qué esperabas, qué salió, y adjunta el **diagnóstico sin contenido**. No envíes capturas ni textos de chats de clientes.
