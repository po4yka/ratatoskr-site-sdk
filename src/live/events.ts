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
  // The pause before a reconnect. The default is a timer. A pause is at least 1 second and, with
  // no `Retry-After`, at most 60 seconds.
  wait?: (milliseconds: number) => Promise<void>;
  // The first pause before a reconnect. The stream can change it with a `retry` field.
  retryMs?: number;
  // A number from 0 to 1 for the jitter of a pause: 1 keeps the whole pause, 0 keeps one half.
  // The default is `Math.random`.
  random?: () => number;
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
  // Failed connections since a stream last opened.
  failures: number;
  // The pause that the last answer asked for with `Retry-After`.
  retryAfterMs: number | null;
}

// Every pause is between these two. Edge sends a keep-alive every 15 seconds.
const floorMs = 1000;
const capMs = 60_000;

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

// A callback that throws is a fault of the site. The client keeps the stream, so that one bad event
// does not stop the live updates.
function deliver(run: Run, frame: SseFrame): void {
  const event = eventOf(frame.data);
  try {
    if (event?.type === 'resync') run.options.onResync();
    else if (event !== null) run.options.onEvent(event, frame.id ?? '');
  } catch {
    // The stream goes on.
  }
}

async function read(run: Run, body: ReadableStream<Uint8Array>): Promise<void> {
  const parser = new SseParser();
  const decoder = new TextDecoder();
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    for (const frame of parser.push(decoder.decode(value, { stream: true }))) deliver(run, frame);
    // Also an event that holds only an id moves the id.
    run.lastEventId = parser.lastEventId ?? run.lastEventId;
    run.retryMs = Math.max(floorMs, parser.retryMs ?? run.retryMs);
  }
}

// `Retry-After` in seconds; a date is not read, because the client has no clock.
function retryAfterOf(response: Response): number | null {
  const seconds = response.headers.get('Retry-After') ?? '';
  return /^\d+$/.test(seconds) ? Number(seconds) * 1000 : null;
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
    run.failures = 0;
    await read(run, response.body);
    return false;
  }
  if (retryable(response.status)) {
    run.retryAfterMs = retryAfterOf(response);
    return false;
  }
  run.options.onError?.(await siteApiError(response));
  return true;
}

// `Retry-After` when the answer had it; else the retry time, doubled for each failure since the
// last stream, at most 60 seconds, and then cut by a random part of up to one half, so that many
// pages do not reconnect at the same moment.
function pause(run: Run): number {
  if (run.retryAfterMs !== null) return Math.max(floorMs, run.retryAfterMs);
  const backoff = Math.min(capMs, run.retryMs * 2 ** run.failures);
  run.failures += 1;
  const random = run.options.random ?? Math.random;
  return Math.max(floorMs, Math.round(backoff * (0.5 + random() / 2)));
}

async function follow(run: Run): Promise<void> {
  const wait = run.options.wait ?? timer;
  while (!run.signal.aborted) {
    run.retryAfterMs = null;
    const stop = await connect(run).catch(() => false);
    if (stop || run.signal.aborted) return;
    await wait(pause(run));
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
    retryMs: Math.max(floorMs, options.retryMs ?? 3000),
    failures: 0,
    retryAfterMs: null,
  });
  return { close: () => controller.abort() };
}
