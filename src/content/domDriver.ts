import {
  findScrollContainer,
  getMain,
  readChatInfo,
  readSnapshot,
  scrollToNewest,
  scrollToOldest,
} from '../adapters/whatsapp/dom';
import type { HistoryDriver } from './historyEngine';

/** Driver real del motor de historial sobre el DOM de la página. */
export function createDomDriver(doc: Document, nowDate: () => Date): HistoryDriver {
  return {
    currentChatKey: () => readChatInfo(doc)?.key ?? null,
    capture: () => readSnapshot(doc, nowDate()),
    scrollOlder: () => {
      const c = findScrollContainer(doc);
      if (!c) return false;
      scrollToOldest(c);
      return true;
    },
    scrollToNewest: () => {
      const c = findScrollContainer(doc);
      if (c) scrollToNewest(c);
    },
    isHidden: () => doc.hidden === true,
    scrollHeight: () => findScrollContainer(doc)?.scrollHeight ?? 0,
    waitForChange: (timeoutMs, signal) =>
      new Promise<boolean>((resolve) => {
        const target = findScrollContainer(doc) ?? getMain(doc);
        if (!target) {
          resolve(false);
          return;
        }
        let settled = false;
        const finish = (changed: boolean) => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          resolve(changed);
        };
        const onAbort = () => finish(false);
        const Observer = doc.defaultView?.MutationObserver ?? MutationObserver;
        const observer = new Observer(() => finish(true));
        observer.observe(target, { childList: true, subtree: true });
        const timer = setTimeout(() => finish(false), timeoutMs);
        signal.addEventListener('abort', onAbort);
      }),
  };
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}
