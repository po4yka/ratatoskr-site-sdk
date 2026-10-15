import type { Page, Release } from '@ratatoskr/site-sdk';

// The sites gateway forwards `/_r/*` to Edge, so the delivery API is on the origin of the site.
const contentBase = `/_r/v1/sites/${encodeURIComponent(__RATATOSKR_SITE_ID__)}/content/`;

async function readJson<T>(route: string): Promise<T> {
  // The public routes take no credential, so none is sent, not even a cookie of this origin.
  const response = await fetch(contentBase + route, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`The delivery API answered ${response.status} for ${route}.`);
  }
  return (await response.json()) as T;
}

export function readRelease(): Promise<Release> {
  return readJson<Release>('release');
}

export function readPage(slug: string): Promise<Page> {
  return readJson<Page>(`pages/${slug.split('/').map(encodeURIComponent).join('/')}`);
}

// The address of the bytes of one asset of the current release.
export function assetUrl(sha256: string): string {
  return `${contentBase}assets/${encodeURIComponent(sha256)}`;
}
