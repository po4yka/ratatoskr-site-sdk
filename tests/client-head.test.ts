import { describe, expect, it } from 'vitest';

import { createContentClient, DeliveryError } from '../src/index.js';
import { etagOfRelease, fakeFetch } from './fake-fetch.js';

const base = '/_r/v1/sites/docs/content/';
const digest = 'a'.repeat(64);

// Each HEAD method of the client, the arguments it takes, and the URL it must read.
const routes = [
  { method: 'releaseHead', args: [], url: `${base}release` },
  { method: 'pageHead', args: ['handbook/start'], url: `${base}pages/handbook/start` },
  { method: 'assetHead', args: [digest], url: `${base}assets/${digest}` },
  { method: 'searchHead', args: [{ q: 'x', limit: 5 }], url: `${base}search?q=x&limit=5` },
];

type HeadMethod = (...args: unknown[]) => Promise<unknown>;

function headOf(handler: Parameters<typeof fakeFetch>[0], name: string) {
  const fake = fakeFetch(handler);
  const client = createContentClient({ baseUrl: '/_r', site: 'docs', fetch: fake.fetch });
  const method: unknown = Reflect.get(client, name);
  expect(method, `the client has no method ${name}`).toBeTypeOf('function');
  return { fake, call: (args: unknown[]) => (method as HeadMethod).apply(client, args) };
}

describe('the HEAD methods of the content client', () => {
  it.each(routes)('$method reads $url with HEAD and gives back the ETag', async (route) => {
    const { fake, call } = headOf(
      () => new Response(null, { headers: { ETag: etagOfRelease } }),
      route.method,
    );
    expect(await call(route.args)).toEqual({ status: 200, etag: etagOfRelease });
    expect(fake.sent).toEqual([
      { url: route.url, method: 'HEAD', credentials: 'omit', headers: {} },
    ]);
  });

  it.each(routes)('$method sends ifNoneMatch and gives back a 304', async (route) => {
    const { fake, call } = headOf(
      () => new Response(null, { status: 304, headers: { ETag: etagOfRelease } }),
      route.method,
    );
    const answer = await call([...route.args, { ifNoneMatch: etagOfRelease }]);
    expect(answer).toEqual({ status: 304, etag: etagOfRelease });
    expect(fake.sent[0]?.headers).toEqual({ 'if-none-match': etagOfRelease });
  });

  it('a 404 to HEAD, which has no body, is a DeliveryError with no code', async () => {
    const { call } = headOf(() => new Response(null, { status: 404 }), 'releaseHead');
    const error: unknown = await call([]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DeliveryError);
    expect(error).toMatchObject({ status: 404, code: null });
  });
});
