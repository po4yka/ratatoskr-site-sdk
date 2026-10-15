import type { components } from '../generated/platform.js';

// What the owner routes and the sign-in route of a site share (workspace change
// `add-site-owner-editing-and-live`, design D4). Every request is same-origin, so the browser
// sends the owner cookie `__Host-ratatoskr-site`, which the page cannot read. Every state change
// carries `X-Ratatoskr-Site-Request: 1`, and the browser adds `Origin` to it; Platform refuses a
// state change without both.

export type PlatformErrorEnvelope = components['schemas']['ErrorEnvelope'];

export const siteRequestHeader = 'X-Ratatoskr-Site-Request';

// The site id: 3 to 40 lower-case ASCII letters, digits and `-`.
const sitePattern = /^[a-z0-9-]{3,40}$/;

// An answer of a site route of Edge other than the expected one. `code` is the code of the error
// envelope, for example `edge.capability_not_granted`, or `null` when the answer has no envelope.
export class SiteApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;

  constructor(status: number, envelope: Partial<PlatformErrorEnvelope> | null) {
    const code = typeof envelope?.code === 'string' ? envelope.code : null;
    super(`Edge answered ${status}${code === null ? '' : ` ${code}`}.`);
    this.name = 'SiteApiError';
    this.status = status;
    this.code = code;
    this.retryable = envelope?.retryable === true;
  }
}

export async function siteApiError(response: Response): Promise<SiteApiError> {
  const envelope = (await response
    .json()
    .catch(() => null)) as Partial<PlatformErrorEnvelope> | null;
  return new SiteApiError(response.status, envelope);
}

export function checkedSite(site: string): string {
  if (!sitePattern.test(site)) throw new RangeError(`${JSON.stringify(site)} is not a site id.`);
  return site;
}

// The options of a same-origin `POST` that changes state on a site route.
export function stateChange(body: BodyInit, contentType: string): RequestInit {
  return {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': contentType, [siteRequestHeader]: '1' },
    body,
  };
}

export const defaultFetch = (): typeof fetch => globalThis.fetch.bind(globalThis);
