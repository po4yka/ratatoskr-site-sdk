import type { SiteEvent } from '../contracts/sites/site-event.v1.js';

// RED stub of SITE-027 task 10.3: it opens the stream without headers and ignores the events.
// Task 10.4 replaces it.

export interface SiteEventsOptions {
  baseUrl: string;
  site: string;
  onEvent: (event: SiteEvent, id: string) => void;
  onResync: () => void;
  onError?: (error: Error) => void;
  fetch?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
}

export interface SiteEvents {
  close(): void;
}

export function openSiteEvents(options: SiteEventsOptions): SiteEvents {
  const controller = new AbortController();
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  fetchImpl(`${options.baseUrl}/v1/sites/${options.site}/events`, {
    signal: controller.signal,
  }).catch(() => undefined);
  return { close: () => controller.abort() };
}
