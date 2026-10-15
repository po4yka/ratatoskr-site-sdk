// A `fetch` that records each request and answers it from a handler, so a test can read exactly
// what the client sends and choose what the delivery API answers.
export interface SentRequest {
  url: string;
  method: string;
  credentials: RequestCredentials | undefined;
  headers: Record<string, string>;
}

export interface FakeFetch {
  fetch: typeof fetch;
  sent: SentRequest[];
}

export const etagOfRelease = '"0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.0123456789abcdef"';

export function fakeFetch(handler: (request: SentRequest) => Response): FakeFetch {
  const sent: SentRequest[] = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request: SentRequest = {
      url: String(input),
      method: init?.method ?? 'GET',
      credentials: init?.credentials,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    };
    sent.push(request);
    return Promise.resolve(handler(request));
  };
  return { fetch: fetchImpl as typeof fetch, sent };
}

// 200 with a JSON body and the `ETag` of a release, as the release, page and search routes answer.
export function jsonAnswer(body: unknown): Response {
  return Response.json(body, { headers: { ETag: etagOfRelease } });
}

// A 404 with the error envelope of the delivery API.
export function absent(code: string): Response {
  return Response.json(
    { code, message: 'The resource does not exist.', retryable: false },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}
