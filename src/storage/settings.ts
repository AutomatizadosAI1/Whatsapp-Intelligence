import { DEFAULT_SETTINGS, type Settings } from '../shared/types';

const KEY = 'wai:settings';

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Valida y completa la configuración guardada (nunca contiene datos de chats). */
export function sanitizeSettings(input: unknown): Settings {
  const s = (typeof input === 'object' && input !== null ? input : {}) as Partial<Settings>;
  return {
    senderLabels: s.senderLabels === 'names' ? 'names' : 'roles',
    includeSystem: typeof s.includeSystem === 'boolean' ? s.includeSystem : DEFAULT_SETTINGS.includeSystem,
    scrollBackWhenDone: typeof s.scrollBackWhenDone === 'boolean' ? s.scrollBackWhenDone : DEFAULT_SETTINGS.scrollBackWhenDone,
    historyTimeLimitMin: clamp(s.historyTimeLimitMin, 1, 60, DEFAULT_SETTINGS.historyTimeLimitMin),
    historyMessageLimit: clamp(s.historyMessageLimit, 100, 100000, DEFAULT_SETTINGS.historyMessageLimit),
    checkpointTtlHours: clamp(s.checkpointTtlHours, 1, 72, DEFAULT_SETTINGS.checkpointTtlHours),
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const r = await chrome.storage.local.get(KEY);
    return sanitizeSettings(r[KEY]);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: sanitizeSettings(settings) });
}
