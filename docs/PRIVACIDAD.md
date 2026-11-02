# Privacidad y tratamiento de datos

WhatsApp Intelligence es una herramienta interna de AutomatizadosAI que trata conversaciones confidenciales de clientes. Este documento describe qué hace con los datos y qué responsabilidades tiene cada parte.

## Qué datos trata

- El contenido **visible** de la conversación abierta en WhatsApp Web: nombre del chat, remitentes visibles, fechas, horas, textos, nombres de archivo y marcas de multimedia.
- El identificador del chat que WhatsApp pone en el DOM, solo para no mezclar conversaciones. No se exporta ni se usa como nombre de almacenamiento (se guarda un hash).

## Qué NO hace

- No envía datos a ningún servidor: no hay red (CSP `connect-src 'none'`), telemetría ni analítica.
- No lee chats automáticamente ni en segundo plano: solo actúa cuando el usuario pulsa un botón del popup.
- No accede a otros dominios, ni a claves, tokens, bases de datos internas o APIs de WhatsApp.
- No envía mensajes, no cambia de chat y no modifica conversaciones. Solo desplaza la lista al recuperar el historial.
- Solo descarga fotos, audios, vídeos y documentos cuando el usuario pulsa **ZIP PARA IA** (ver abajo).

## ZIP PARA IA (desde la v1.1)

- Para cada foto o vídeo, la extensión lo abre en el visor de WhatsApp y lo cierra. Para cada nota de voz, la reproduce **en silencio** y la pausa. Para cada documento (PDF, Word, Excel…), pulsa su botón Descargar: mientras dura la captura, el archivo va al ZIP en vez de a la carpeta de Descargas y no se abre ninguna pestaña.
- El archivo se toma del Blob que WhatsApp ya ha descargado y descifrado. Lo recoge `page-hook.js`, un script que corre en la página y que solo está activo durante la descarga: se activa con un token aleatorio y se desactiva al terminar.
- **Efecto visible para el cliente:** las notas de voz recibidas que no se hubieran escuchado quedan marcadas como escuchadas.
- El ZIP se genera en memoria y se guarda en la carpeta de Descargas. No sale del equipo.
- Límites: 100 MB por archivo y 700 MB por ZIP. Lo que no se puede descargar se indica en el texto con su motivo; nunca se asigna un archivo a otro mensaje.

## Dónde quedan los datos

| Dato | Ubicación | Duración |
| --- | --- | --- |
| Conversación extraída | Memoria del content script de la pestaña | Hasta recargar o cerrar la pestaña |
| Copia temporal (checkpoint) | `chrome.storage.session`: memoria del navegador, no disco | Caduca a las 12 h (configurable de 1 a 72), al cerrar Chrome o al borrarla en Ajustes |
| Ajustes | `chrome.storage.local` | No contienen datos de chats |
| Lo copiado o descargado (incluido el ZIP con fotos, audios, vídeos y documentos) | Portapapeles y carpeta de Descargas del usuario | Responsabilidad del usuario |

## Responsabilidades del usuario

- Usarla solo con conversaciones en las que AutomatizadosAI tiene base legítima para tratar los datos.
- Pegar las conversaciones solo en herramientas de IA aprobadas por la empresa y con la configuración de privacidad corporativa (p. ej. sin entrenamiento con los datos).
- Borrar los archivos descargados cuando ya no se necesiten y no compartirlos fuera de los canales autorizados.
- Usar **Ajustes → Borrar todos los datos temporales** al terminar en equipos compartidos.

## Transcripción de audio (futuro)

La V1 no transcribe. Una V2 con proveedor remoto requerirá consentimiento explícito por uso, un backend propio con las claves fuera de la extensión, aviso de transferencia de datos y revisión de protección de datos (RGPD) antes de activarse. La interfaz está preparada en `src/audio/provider.ts` y bloquea los proveedores remotos sin consentimiento.
