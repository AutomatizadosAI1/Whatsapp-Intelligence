/**
 * Copias temporales (checkpoints) de las conversaciones extraídas.
 *
 * Implementación por defecto: chrome.storage.session, que vive en memoria del
 * navegador, no se escribe a disco y se borra al cerrar Chrome o recargar la
 * extensión. Además caduca por TTL. Solo el service worker accede a ella.
 */
import type { Checkpoint } from '../shared/types';
import { hashString } from '../shared/hash';

export type SaveResult = { ok: true; bytes: number } | { ok: false; error: string };

export interface CheckpointStore {
  save(cp: Checkpoint): Promise<SaveResult>;
  load(chatKey: string): Promise<Checkpoint | null>;
  remove(chatKey: string): Promise<void>;
  clearAll(): Promise<void>;
  stats(): Promise<{ count: number; bytes: number }>;
  purgeExpired(): Promise<number>;
}

/** Subconjunto de chrome.storage.StorageArea que usamos (inyectable en tests). */
export interface StorageAreaLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

const INDEX_KEY = 'cp:index';
/** chrome.storage.session admite 10 MB; dejamos margen. */
export const SESSION_QUOTA_BYTES = 9 * 1024 * 1024;

type Index = Record<string, { savedAt: number; bytes: number }>;

export function checkpointKey(chatKey: string): string {
  return `cp:${hashString(chatKey)}`;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export class SessionCheckpointStore implements CheckpointStore {
  constructor(
    private readonly area: StorageAreaLike,
    private readonly ttlMs: () => Promise<number>,
    private readonly now: () => number = Date.now,
    private readonly quotaBytes = SESSION_QUOTA_BYTES,
  ) {}

  private async index(): Promise<Index> {
    const r = await this.area.get(INDEX_KEY);
    return (r[INDEX_KEY] as Index | undefined) ?? {};
  }

  async purgeExpired(): Promise<number> {
    const idx = await this.index();
    const ttl = await this.ttlMs();
    const expired = Object.entries(idx).filter(([, v]) => this.now() - v.savedAt > ttl).map(([k]) => k);
    if (expired.length === 0) return 0;
    await this.area.remove(expired);
    for (const k of expired) delete idx[k];
    await this.area.set({ [INDEX_KEY]: idx });
    return expired.length;
  }

  async save(cp: Checkpoint): Promise<SaveResult> {
    await this.purgeExpired();
    const key = checkpointKey(cp.chatKey);
    const serialized = JSON.stringify(cp);
    const bytes = byteLength(serialized);
    const idx = await this.index();
    const others = Object.entries(idx).filter(([k]) => k !== key).reduce((acc, [, v]) => acc + v.bytes, 0);
    if (others + bytes > this.quotaBytes) {
      return {
        ok: false,
        error: `La copia temporal (${Math.round(bytes / 1024)} KB) supera el espacio disponible en memoria de sesión.`,
      };
    }
    try {
      await this.area.set({ [key]: cp });
      idx[key] = { savedAt: cp.savedAt, bytes };
      await this.area.set({ [INDEX_KEY]: idx });
      return { ok: true, bytes };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error de almacenamiento' };
    }
  }

  async load(chatKey: string): Promise<Checkpoint | null> {
    await this.purgeExpired();
    const key = checkpointKey(chatKey);
    const r = await this.area.get(key);
    const cp = r[key] as Checkpoint | undefined;
    if (!cp || cp.version !== 1 || cp.chatKey !== chatKey) return null;
    return cp;
  }

  async remove(chatKey: string): Promise<void> {
    const key = checkpointKey(chatKey);
    await this.area.remove(key);
    const idx = await this.index();
    delete idx[key];
    await this.area.set({ [INDEX_KEY]: idx });
  }

  async clearAll(): Promise<void> {
    const idx = await this.index();
    await this.area.remove([...Object.keys(idx), INDEX_KEY]);
  }

  async stats(): Promise<{ count: number; bytes: number }> {
    const idx = await this.index();
    const values = Object.values(idx);
    return { count: values.length, bytes: values.reduce((a, v) => a + v.bytes, 0) };
  }
}

/** Almacén en memoria para tests y como respaldo. */
export class MemoryArea implements StorageAreaLike {
  data = new Map<string, unknown>();
  failNextSet = false;
  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    const list = keys === null ? [...this.data.keys()] : Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const k of list) if (this.data.has(k)) out[k] = structuredClone(this.data.get(k));
    return out;
  }
  async set(items: Record<string, unknown>): Promise<void> {
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('QUOTA_BYTES quota exceeded');
    }
    for (const [k, v] of Object.entries(items)) this.data.set(k, structuredClone(v));
  }
  async remove(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.data.delete(k);
  }
}
