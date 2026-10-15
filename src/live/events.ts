import type { SiteEvent } from '../contracts/sites/site-event.v1.js';
import { checkedSite, defaultFetch, type SiteApiError, siteApiError } from '../owner/request.js';
import { type SseFrame, SseParser } from './sse.js';

// The client of the site event stream `GET /v1/sites/{site}/events` (workspace change
// `add-site-owner-editing-and-live`, design D5, spec `site-live-events`).
//
// The data of each event is a `sites/site-event.v1` document. An anonymous page receives only
// `release.published`; the owner session of the site also receives `draft.changed`,
// `edit.completed` and `edit.conflicted`. An event id is `<epoch>.<sequence>` and is opaque here.
// After a break the client reconnects with `Last-Event-ID`. Edge then replays the events after it,
// or sends `resync` when it no longer has them, and the site fetches its state again.
//
// The client reads the stream with `fetch`, not `EventSource`, so that it can send the header and
// choose when it reconnects.

export type SiteNotice = Exclude<SiteEvent, { type: 'resync' }>;

export interface SiteEventsOptions {
  // The prefix in front of `/v1/sites/...`: `/_r` behind the sites gateway.
  baseUrl: string;
  site: string;
  onEvent: (event: SiteNotice, id: string) => void;
  // Fetch the current state again: some events after the last id are lost.
  onResync: () => void;
  // The stream stopped for good, for example 401 or 404. A 5xx answer, 429 and a network error
  // start a reconnect instead.
  onError?: (error: SiteApiError) => void;
  fetch?: typeof fetch;
  // The pause before a reconnect. The default is a timer.
  wait?: (milliseconds: number) => Promise<void>;
  // The first pause before a reconnect. The stream can change it with a `retry` field.
  retryMs?: number;
}

export interface SiteEvents {
  close(): void;
}

interface Run {
  options: SiteEventsOptions;
  url: string;
  signal: AbortSignal;
  lastEventId: string | undefined;
  retryMs: number;
}

const eventTypes = new Set<string>([
  'release.published',
  'draft.changed',
  'edit.completed',
  'edit.conflicted',
  'resync',
]);

const timer = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const retryable = (status: number): boolean => status >= 500 || status === 429;

function eventOf(data: string): SiteEvent | null {
  try {
    const event = JSON.parse(data) as { type?: unknown };
    return typeof event.type === 'string' && eventTypes.has(event.type)
      ? (event as SiteEvent)
      : null;
  } catch {
    return null;
  }
}

function deliver(run: Run, frame: SseFrame): void {
  run.lastEventId = frame.id ?? run.lastEventId;
  const event = eventOf(frame.data);
  if (event?.type === 'resync') run.options.onResync();
  else if (event !== null) run.options.onEvent(event, frame.id ?? '');
}

async function read(run: Run, body: ReadableStream<Uint8Array>): Promise<void> {
  const parser = new SseParser();
  const decoder = new TextDecoder();
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    for (const frame of parser.push(decoder.decode(value, { stream: true }))) deliver(run, frame);
    run.retryMs = parser.retryMs ?? run.retryMs;
  }
}

// One connection. `true` when the client must stop; `false` when it reconnects.
async function connect(run: Run): Promise<boolean> {
  const headers = new Headers({ Accept: 'text/event-stream' });
  if (run.lastEventId !== undefined) headers.set('Last-Event-ID', run.lastEventId);
  const response = await (run.options.fetch ?? defaultFetch())(run.url, {
    headers,
    // Same-origin, so that the owner cookie goes with it; an anonymous page has none.
    credentials: 'same-origin',
    cache: 'no-store',
    signal: run.signal,
  });
  if (response.status === 200 && response.body !== null) {
    await read(run, response.body);
    return false;
  }
  if (retryable(response.status)) return false;
  run.options.onError?.(await siteApiError(response));
  return true;
}

async function follow(run: Run): Promise<void> {
  const wait = run.options.wait ?? timer;
  while (!run.signal.aborted) {
    const stop = await connect(run).catch(() => false);
    if (stop || run.signal.aborted) return;
    await wait(run.retryMs);
  }
}

export function openSiteEvents(options: SiteEventsOptions): SiteEvents {
  const site = checkedSite(options.site);
  const controller = new AbortController();
  void follow({
    options,
    url: `${options.baseUrl}/v1/sites/${site}/events`,
    signal: controller.signal,
    lastEventId: undefined,
    retryMs: options.retryMs ?? 3000,
  });
  return { close: () => controller.abort() };
}
