import { describe, expect, it } from 'vitest';

import { createContentClient, DeliveryError, type SearchQuery } from '../src/index.js';
import { absent, etagOfRelease, fakeFetch, jsonAnswer } from './fake-fetch.js';

const base = '/_r/v1/sites/docs/content/';
const digest = 'a'.repeat(64);

function clientWith(handler: Parameters<typeof fakeFetch>[0]) {
  const fake = fakeFetch(handler);
  return { fake, client: createContentClient({ baseUrl: '/_r', site: 'docs', fetch: fake.fetch }) };
}

describe('the content client', () => {
  it('reads the four routes with GET and no credential', async () => {
    const { fake, client } = clientWith(() => jsonAnswer({}));
    await client.release();
    await client.page('handbook/start');
    await client.asset(digest);
    await client.search({ q: 'hello world', limit: 5, offset: 10 });
    expect(fake.sent.map((request) => request.url)).toEqual([
      `${base}release`,
      `${base}pages/handbook/start`,
      `${base}assets/${digest}`,
      `${base}search?q=hello+world&limit=5&offset=10`,
    ]);
    for (const request of fake.sent) {
      expect(request.method).toBe('GET');
      expect(request.credentials).toBe('omit');
      expect(request.headers).not.toHaveProperty('authorization');
      expect(request.headers).not.toHaveProperty('cookie');
    }
  });

  it('gives back the body and the ETag of a 200', async () => {
    const { client } = clientWith((request) =>
      request.url.includes('/assets/')
        ? new Response('bytes', { headers: { ETag: `"${digest}"` } })
        : jsonAnswer({ results: [], has_more: false }),
    );
    expect(await client.search({ q: 'x' })).toEqual({
      status: 200,
      etag: etagOfRelease,
      body: { results: [], has_more: false },
    });
    const asset = await client.asset(digest);
    expect(asset.status === 200 && asset.body instanceof Blob).toBe(true);
    expect(asset.status === 200 ? await asset.body.text() : null).toBe('bytes');
    expect(asset.etag).toBe(`"${digest}"`);
  });

  it('sends ifNoneMatch and gives back a 304 with no body', async () => {
    const { fake, client } = clientWith(
      () => new Response(null, { status: 304, headers: { ETag: etagOfRelease } }),
    );
    const answer = await client.release({ ifNoneMatch: etagOfRelease });
    expect(answer).toEqual({ status: 304, etag: etagOfRelease });
    expect(fake.sent[0]?.headers['if-none-match']).toBe(etagOfRelease);
  });

  it.each([
    ['release', 'sites.site_not_found'],
    ['page', 'sites.page_not_found'],
    ['asset', 'sites.asset_not_found'],
  ] as const)('a 404 of the %s route is a DeliveryError with %s', async (route, code) => {
    const { client } = clientWith(() => absent(code));
    const read = {
      release: () => client.release(),
      page: () => client.page('handbook/start'),
      asset: () => client.asset(digest),
    }[route];
    const error: unknown = await read().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DeliveryError);
    expect(error).toMatchObject({ status: 404, code });
  });
});

describe('the content client refuses a value before the request', () => {
  it.each(['../release', 'a//b', 'a/', 'A', 'handbook/./start', `${'x'.repeat(1025)}`])(
    'the slug %j',
    async (slug) => {
      const { fake, client } = clientWith(() => jsonAnswer({}));
      await expect(client.page(slug)).rejects.toThrow(RangeError);
      expect(fake.sent).toEqual([]);
    },
  );

  it('an asset digest that is not lower-case hex SHA-256, and a site id out of grammar', async () => {
    const { fake, client } = clientWith(() => jsonAnswer({}));
    await expect(client.asset('A'.repeat(64))).rejects.toThrow(RangeError);
    expect(() => createContentClient({ baseUrl: '/_r', site: 'x', fetch: fake.fetch })).toThrow(
      RangeError,
    );
    expect(fake.sent).toEqual([]);
  });

  it.each<[string, SearchQuery]>([
    ['an empty q', { q: '' }],
    ['a q of 257 characters', { q: 'x'.repeat(257) }],
    ['the limit 0', { q: 'x', limit: 0 }],
    ['the limit 51', { q: 'x', limit: 51 }],
    ['the limit 2.5', { q: 'x', limit: 2.5 }],
    ['the offset -1', { q: 'x', offset: -1 }],
    ['the offset 0.5', { q: 'x', offset: 0.5 }],
  ])('the search query with %s', async (_label, query) => {
    const { fake, client } = clientWith(() => jsonAnswer({ results: [], has_more: false }));
    await expect(client.search(query)).rejects.toThrow(RangeError);
    expect(fake.sent).toEqual([]);
  });

  it('accepts a search query of 256 Unicode scalar values and the limits 1 and 50', async () => {
    const { fake, client } = clientWith(() => jsonAnswer({ results: [], has_more: false }));
    await client.search({ q: '\u{1F600}'.repeat(256), limit: 1, offset: 0 });
    await client.search({ q: 'x', limit: 50 });
    expect(fake.sent).toHaveLength(2);
  });
});
