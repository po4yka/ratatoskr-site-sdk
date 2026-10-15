import { describe, expect, it, vi } from 'vitest';

import { openSiteEvents } from './events.js';

// SITE-027 review, low findings: the event client backs off with a cap and jitter, follows
// `Retry-After`, never waits less than one second, resumes from an event that holds only an id,
// and a callback that throws does not stop the stream.
const draft = (revision: string): string =>
  `event: draft.changed\ndata: ${JSON.stringify({
    type: 'draft.changed',
    payload: { source_ref: 'src_1', revision: revision.repeat(64) },
  })}\n\n`;

type Answer = { status: number; text?: string; headers?: Record<string, string> };

// A stub of the event route that gives answer `n` to request `n`. An answer of status 200 sends
// its text and ends, except the last answer, which stays open until the client closes.
function stubAnswers(answers: Answer[]) {
  const opened: Record<string, string>[] = [];
  const fetchImpl = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    opened.push(Object.fromEntries(new Headers(init?.headers).entries()));
    const answer = answers[opened.length - 1] ?? { status: 200 };
    const last = opened.length >= answers.length;
    if (answer.status !== 200) {
      return Promise.resolve(
        new Response(null, { status: answer.status, headers: answer.headers ?? {} }),
      );
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(answer.text ?? ''));
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

function follow(answers: Answer[], options: { onEvent?: () => void } = {}) {
  const edge = stubAnswers(answers);
  const wait = vi.fn<(milliseconds: number) => Promise<void>>(() => Promise.resolve());
  const events = openSiteEvents({
    baseUrl: '/_r',
    site: 'docs',
    onEvent: options.onEvent ?? vi.fn(),
    onResync: vi.fn(),
    fetch: edge.fetch,
    wait,
    random: () => 1,
  });
  return { edge, wait, events };
}

describe('the reconnect of the site event client', () => {
  it('backs off twice as long after each failure, up to 60 seconds', async () => {
    const busy = Array.from({ length: 7 }, () => ({ status: 503 }));
    const { edge, wait, events } = follow([...busy, { status: 200 }]);
    try {
      await vi.waitFor(() => expect(edge.opened).toHaveLength(8));
      expect(wait.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
        3000, 6000, 12000, 24000, 48000, 60000, 60000,
      ]);
    } finally {
      events.close();
    }
  });

  it('follows Retry-After', async () => {
    const { edge, wait, events } = follow([
      { status: 503, headers: { 'Retry-After': '7' } },
      { status: 200 },
    ]);
    try {
      await vi.waitFor(() => expect(edge.opened).toHaveLength(2));
      expect(wait).toHaveBeenCalledExactlyOnceWith(7000);
    } finally {
      events.close();
    }
  });

  it('never waits less than one second', async () => {
    const { edge, wait, events } = follow([{ status: 200, text: 'retry: 0\n\n' }, { status: 200 }]);
    try {
      await vi.waitFor(() => expect(edge.opened).toHaveLength(2));
      expect(wait).toHaveBeenCalledExactlyOnceWith(1000);
    } finally {
      events.close();
    }
  });

  it('resumes from an event that holds only an id', async () => {
    const { edge, events } = follow([{ status: 200, text: 'id: e3.1\n\n' }, { status: 200 }]);
    try {
      await vi.waitFor(() => expect(edge.opened[1]?.['last-event-id']).toBe('e3.1'));
    } finally {
      events.close();
    }
  });

  it('keeps reading when a callback throws', async () => {
    const onEvent = vi.fn(() => {
      throw new Error('a bug in the site');
    });
    const { edge, events } = follow([{ status: 200, text: draft('a') + draft('b') }], { onEvent });
    try {
      await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2));
      expect(edge.opened).toHaveLength(1);
    } finally {
      events.close();
    }
  });
});
