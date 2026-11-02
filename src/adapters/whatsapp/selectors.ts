/**
 * Único lugar con conocimiento de la estructura del DOM de WhatsApp Web.
 * Cada señal tiene varias alternativas ordenadas por preferencia. Las clases
 * ofuscadas (p. ej. "x1n2onr6") no se usan; solo ids, atributos data-*,
 * roles ARIA y las clases semánticas históricas (message-in/out, copyable-text).
 *
 * Si WhatsApp cambia su DOM, este es el archivo que hay que revisar. El botón
 * "Diagnóstico" del popup informa de qué selectores siguen encontrando algo.
 */

export const SELECTORS = {
  /** Panel de la conversación abierta. Solo existe con un chat seleccionado. */
  main: ['#main', '[data-testid="conversation-panel-wrapper"]'],
  /** Título del chat dentro de la cabecera. */
  headerTitle: [
    '#main header [data-testid="conversation-info-header-chat-title"]',
    '#main header span[dir="auto"][title]',
    '#main header [title]',
    '#main header span[dir="auto"]',
  ],
  /** Contenedor desplazable de mensajes (alternativas si el cálculo por estilo falla). */
  scrollContainer: [
    '#main [data-testid="conversation-panel-messages"]',
    '#main [role="application"]',
    '#main .copyable-area [tabindex="0"]',
  ],
  /** Elemento de mensaje: cualquier nodo con data-id con forma de id de mensaje. */
  messageId: '[data-id]',
  /** Burbuja del mensaje (WhatsApp Web 2026 ya no usa las clases message-in/out). */
  msgContainer: '[data-testid="msg-container"]',
  /** Hora y estado de entrega dentro de la burbuja. */
  msgMeta: '[data-testid="msg-meta"]',
  /** Autor visible en grupos ("Tú:" en los propios). */
  author: '[data-testid="author"]',
  /** Indicios de chat de grupo dentro del panel. */
  groupHints: ['[data-testid="group-chat-profile-picture"]'],
  imageThumb: '[data-testid="image-thumb"]',
  videoContent: '[data-testid="video-content"]',
  incoming: '.message-in',
  outgoing: '.message-out',
  prePlainText: '[data-pre-plain-text]',
  bodyText: ['span.selectable-text', '[data-testid="selectable-text"]'],
  quoted: [
    '[data-testid="quoted-message"]',
    '[aria-label="Mensaje citado"]',
    '[aria-label="Quoted message"]',
    '[aria-label="Missatge citat"]',
  ],
  quotedText: ['.quoted-mention', '[data-testid="quoted-text"]'],
  loading: ['[role="progressbar"]', '[data-testid*="spinner" i]', '[data-icon*="spinner" i]'],
} as const;

/** "true_34600000000@c.us_3EB0ABCD" o "false_1203@g.us_3EB0_34611111111@c.us". */
export const MESSAGE_ID_RE = /^(true|false)_([^_\s]+@[a-z.]+)_([A-Za-z0-9]+)(?:_([^_\s]+@[a-z.]+))?$/;

/** Formato actual: id opaco sin dirección ni chat (p. ej. "3EB0AE6B17149D58D716A0"). */
export const OPAQUE_MESSAGE_ID_RE = /^[A-Za-z0-9]{12,64}$/;

/**
 * Iconos de estado de entrega (enviado, entregado, leído, pendiente). Solo los
 * llevan los mensajes propios, así que marcan la dirección sin depender del idioma.
 * WhatsApp los pone como <title> del SVG ("wds-ic-read") o, antes, en data-icon.
 */
export const OUTGOING_STATUS_ICON_RE =
  /^(wds-ic-(read|delivered|sent|pending|check|dblcheck|clock)|msg-(check|dblcheck|time|dblcheck-ack)|ic-(done|done-all|schedule))$/i;

/** Etiqueta accesible del autor en los mensajes propios. */
export const SELF_AUTHOR_LABEL_RE = /^(tú|tu|you|vos|tu mateix)\s*:?$/i;

/** Iconos de interfaz presentes en cualquier burbuja: no indican multimedia. */
export const IGNORED_ICON_RE =
  /^(msg-(check|dblcheck|time|dblcheck-ack)|tail-(in|out)|default-(contact|user|group)|down-context|react|forward-chat|star|pinned|kept|status-|chevron|menu|smiley|forwarded|edited|emoji|conv-msg-|msg-container|msg-meta|author|addon-|selectable-text|chat-msg-symbol|media-url-provider|wds-ic-(read|delivered|sent|pending|check|dblcheck|clock|pip)|ic-(play-arrow|pause|expand-more|mood|fast-forward|done|schedule|forward|keyboard-arrow))/i;

export type MediaSignalKind =
  | 'deleted' | 'voice' | 'audio' | 'sticker' | 'gif' | 'video' | 'image'
  | 'document' | 'location' | 'contact' | 'poll' | 'call';

/** Orden = prioridad. Se evalúan sobre data-icon y data-testid de la burbuja. */
export const MEDIA_SIGNALS: Array<{ kind: MediaSignalKind; re: RegExp }> = [
  { kind: 'deleted', re: /recalled|revoked|deleted-message/i },
  { kind: 'voice', re: /(^|-)ptt($|-)|voice-note|keyboard-voice/i },
  { kind: 'audio', re: /(^|-)audio($|-)|^mic($|-)/i },
  { kind: 'sticker', re: /sticker/i },
  { kind: 'gif', re: /(^|-)gif($|-)/i },
  { kind: 'video', re: /video(?!-call)|videocam|media-play/i },
  { kind: 'document', re: /^document|^doc-|-doc$|(^|-)pdf($|-)|^file-|ic-description|insert-drive-file|picture-as-pdf|ic-article|document-thumb/i },
  { kind: 'location', re: /^location|live-location/i },
  { kind: 'contact', re: /vcard|contact-card|^contact$/i },
  { kind: 'poll', re: /(^|-)poll($|-)/i },
  { kind: 'image', re: /image|photo|media-thumb|^img-/i },
  { kind: 'call', re: /missed-call|voice-call|video-call|^call($|-)/i },
];

export const TEXT_PATTERNS = {
  deleted: /^(se eliminó este mensaje|eliminaste este mensaje|este mensaje fue eliminado|this message was deleted|you deleted this message|s'ha suprimit aquest missatge|has suprimit aquest missatge)\.?$/i,
  edited: /^(editado|edited|editat)$/i,
  forwarded: /^(reenviado|forwarded|reenviat|reenviado muchas veces|forwarded many times)$/i,
  readMore: /^(leer más|read more|llegir més|ver más)$/i,
  unreadBanner: /^\d+\s+(mensajes? no leídos?|unread messages?|missatges? no llegits?)$/iu,
  encryptionNotice: /cifrad[oa]s? de extremo a extremo|end-to-end encrypted|xifrats? d'extrem a extrem/i,
  phoneSync: /mensajes anteriores (de|desde) tu (teléfono|móvil)|older messages from your phone|obtener mensajes anteriores|get older messages|missatges anteriors del (teu )?telèfon|en tu (teléfono|móvil) para ver mensajes anteriores|on your phone to see older messages|al (teu )?telèfon per veure missatges anteriors/i,
  loadingText: /^(cargando|loading|carregant)( mensajes| messages| missatges)?(\.\.\.|…)?$/i,
};
