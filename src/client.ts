import type { components, operations } from './generated/content-delivery.js';

// A typed client for the four routes of the Content Delivery API. The types come from
// `src/generated/`, which `scripts/generate-client.ts` generates from the pinned description.
//
// The client sends `GET` with no credential and no cookie. It treats an `ETag` as an opaque value:
// it never reads a release id or a digest from it, and it never checks the bytes of a release
// against the release id, because the release document can be a filtered copy.

export type DeliveryRelease =
  operations['getRelease']['responses'][200]['content']['application/json'];
export type DeliveryPage = operations['getPage']['responses'][200]['content']['application/json'];
export type SearchResults = components['schemas']['SearchResults'];
export type SearchResult = components['schemas']['SearchResult'];
export type ErrorEnvelope = components['schemas']['ErrorEnvelope'];
// `q` is 1 to 256 Unicode scalar values, `limit` 1 to 50 (the API uses 10 when it is absent), and
// `offset` 0 or more. The API answers 400 to a value out of range.
export type SearchQuery = operations['searchRelease']['parameters']['query'];

// 200 with the body, or 304 with no body when `ifNoneMatch` matches the current answer.
export type DeliveryAnswer<T> =
  { status: 200; etag: string | null; body: T } | { status: 304; etag: string | null };

// The answer to HEAD: the status and the `ETag` of the GET answer, with no body.
export interface HeadAnswer {
  status: 200 | 304;
  etag: string | null;
}

export interface ReadOptions {
  // An `ETag` of an earlier answer.
  ifNoneMatch?: string;
  signal?: AbortSignal;
}

export interface ContentClientOptions {
  // The prefix in front of `/v1/sites/...`: `/_r` on the origin of a site behind the sites gateway.
  baseUrl: string;
  // The site id: 3 to 40 lower-case ASCII letters, digits and `-`.
  site: string;
  fetch?: typeof fetch;
}

export interface ContentClient {
  release(options?: ReadOptions): Promise<DeliveryAnswer<DeliveryRelease>>;
  // `slug` has the grammar of the contract `Slug`, for example `handbook/start`.
  page(slug: string, options?: ReadOptions): Promise<DeliveryAnswer<DeliveryPage>>;
  // `sha256` is the lower-case hex digest of the asset, as the release names it.
  asset(sha256: string, options?: ReadOptions): Promise<DeliveryAnswer<Blob>>;
  search(query: SearchQuery, options?: ReadOptions): Promise<DeliveryAnswer<SearchResults>>;
  releaseHead(options?: ReadOptions): Promise<HeadAnswer>;
  pageHead(slug: string, options?: ReadOptions): Promise<HeadAnswer>;
  assetHead(sha256: string, options?: ReadOptions): Promise<HeadAnswer>;
  searchHead(query: SearchQuery, options?: ReadOptions): Promise<HeadAnswer>;
}

// An answer other than 200 and 304. A 404 has the code `sites.site_not_found`,
// `sites.page_not_found` or `sites.asset_not_found`, and a 503 `sites.service_unavailable`. An
// answer to HEAD has no body, so its code is `null`.
export class DeliveryError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, envelope: Partial<ErrorEnvelope> | null) {
    const code = typeof envelope?.code === 'string' ? envelope.code : null;
    super(`The delivery API answered ${status}${code === null ? '' : ` ${code}`}.`);
    this.name = 'DeliveryError';
    this.status = status;
    this.code = code;
  }
}

const sitePattern = /^[a-z0-9-]{3,40}$/;
// The contract `Slug`. It also keeps a `.`, `..` or empty segment out of the request path, where
// URL normalisation would turn it into another route.
const slugPattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

function checked(value: string, rule: { name: string; pattern: RegExp; max?: number }): string {
  if (!rule.pattern.test(value) || value.length > (rule.max ?? Infinity)) {
    throw new RangeError(`${JSON.stringify(value)} is not a valid ${rule.name}.`);
  }
  return value;
}

function checkedNumber(rule: {
  name: string;
  value: number | undefined;
  min: number;
  max: number;
}) {
  const { name, value, min, max } = rule;
  if (value !== undefined && (!Number.isInteger(value) || value < min || value > max)) {
    throw new RangeError(`The search ${name} must be an integer from ${min} to ${max}.`);
  }
}

// The API answers 400 to these values, so the client refuses them before the request.
function searchRoute(query: SearchQuery): string {
  const length = [...query.q].length;
  if (length < 1 || length > 256) {
    throw new RangeError('The search q must be 1 to 256 Unicode scalar values.');
  }
  checkedNumber({ name: 'limit', value: query.limit, min: 1, max: 50 });
  checkedNumber({ name: 'offset', value: query.offset, min: 0, max: Number.MAX_SAFE_INTEGER });
  const params = new URLSearchParams({ q: query.q });
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  return `search?${params.toString()}`;
}

const pageRoute = (slug: string): string =>
  `pages/${checked(slug, { name: 'slug', pattern: slugPattern, max: 1024 })}`;
const assetRoute = (sha256: string): string =>
  `assets/${checked(sha256, { name: 'asset digest', pattern: sha256Pattern })}`;

async function failure(response: Response): Promise<DeliveryError> {
  const envelope = (await response.json().catch(() => null)) as Partial<ErrorEnvelope> | null;
  return new DeliveryError(response.status, envelope);
}

async function headAnswer(response: Response): Promise<HeadAnswer> {
  if (response.status !== 200 && response.status !== 304) throw await failure(response);
  return { status: response.status === 304 ? 304 : 200, etag: response.headers.get('ETag') };
}

async function answer<T>(
  response: Response,
  body: (response: Response) => Promise<T>,
): Promise<DeliveryAnswer<T>> {
  const { status, etag } = await headAnswer(response);
  return status === 304 ? { status, etag } : { status, etag, body: await body(response) };
}

const json = <T>(response: Response): Promise<T> => response.json() as Promise<T>;
const blob = (response: Response): Promise<Blob> => response.blob();

interface Request extends ReadOptions {
  method: 'GET' | 'HEAD';
}

export function createContentClient(options: ContentClientOptions): ContentClient {
  const site = checked(options.site, { name: 'site id', pattern: sitePattern });
  const base = `${options.baseUrl}/v1/sites/${site}/content/`;
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function read(route: string, request: Request): Promise<Response> {
    const headers = new Headers();
    if (request.ifNoneMatch !== undefined) headers.set('If-None-Match', request.ifNoneMatch);
    // The public routes take no credential, so none is sent, not even a cookie of this origin.
    const init: RequestInit = { method: request.method, headers, credentials: 'omit' };
    if (request.signal !== undefined) init.signal = request.signal;
    return fetchImpl(base + route, init);
  }
  const get = (route: string, readOptions: ReadOptions = {}) =>
    read(route, { ...readOptions, method: 'GET' });
  const head = async (route: string, readOptions: ReadOptions = {}) =>
    headAnswer(await read(route, { ...readOptions, method: 'HEAD' }));

  return {
    release: async (o) => answer(await get('release', o), json<DeliveryRelease>),
    page: async (slug, o) => answer(await get(pageRoute(slug), o), json<DeliveryPage>),
    asset: async (sha256, o) => answer(await get(assetRoute(sha256), o), blob),
    search: async (query, o) => answer(await get(searchRoute(query), o), json<SearchResults>),
    releaseHead: async (o) => head('release', o),
    pageHead: async (slug, o) => head(pageRoute(slug), o),
    assetHead: async (sha256, o) => head(assetRoute(sha256), o),
    searchHead: async (query, o) => head(searchRoute(query), o),
  };
}
