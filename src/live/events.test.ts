import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import type { SiteEvent } from '../contracts/sites/site-event.v1.js';
import { openSiteEvents } from './events.js';

// SITE-027 task 10.3 (workspace design D5, spec `site-live-events`): the client resumes from the
// last event id after a break, and fetches again on `resync`. Event ids are `<epoch>.<sequence>`.
const fixture = (name: string): SiteEvent =>
  JSON.parse(
    readFileSync(`contracts/fixtures/sites/site-event/valid/${name}.json`, 'utf8'),
  ) as SiteEvent;

const frame = (id: string, event: SiteEvent): string =>
  `id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

interface Opened {
  url: string;
  headers: Record<string, string>;
}

// A stub of the event route: answer `n` gets `bodies[n]`. The last answer stays open until the
// client closes it; every other answer ends after its body, as a dropped connection does.
function stubStream(bodies: string[]) {
  const opened: Opened[] = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    opened.push({
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    const text = bodies[opened.length - 1] ?? '';
    const last = opened.length >= bodies.length;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        if (!last) controller.close();
        else init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
      },
    });
    return Promise.resolve(
      new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
  };
  return { fetch: fetchImpl as typeof fetch, opened };
}

// The pause before a reconnect, with no clock.
const noPause = (): Promise<void> => Promise.resolve();

describe('the site event client', () => {
  it('reconnect_sends_last_event_id', async () => {
    const draft = fixture('draft-changed');
    const edge = stubStream([`: keep-alive\n\n${frame('e1.7', draft)}`, '']);
    const onEvent = vi.fn();

    const events = openSiteEvents({
      baseUrl: '/_r',
      site: 'docs',
      onEvent,
      onResync: vi.fn(),
      fetch: edge.fetch,
      wait: noPause,
    });
    try {
      await vi.waitFor(() => expect(edge.opened[1]?.headers['last-event-id']).toBe('e1.7'));
      expect(edge.opened[0]?.url).toBe('/_r/v1/sites/docs/events');
      expect(edge.opened[0]?.headers['last-event-id']).toBeUndefined();
      expect(onEvent).toHaveBeenCalledExactlyOnceWith(draft, 'e1.7');
    } finally {
      events.close();
    }
  });

  it('resync_triggers_refetch_callback', async () => {
    const edge = stubStream([frame('e2.9', fixture('resync'))]);
    const refetch = vi.fn();
    const onEvent = vi.fn();

    const events = openSiteEvents({
      baseUrl: '/_r',
      site: 'docs',
      onEvent,
      onResync: refetch,
      fetch: edge.fetch,
      wait: noPause,
    });
    try {
      await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
      expect(onEvent).not.toHaveBeenCalled();
    } finally {
      events.close();
    }
  });
});
