import {
  createContentClient,
  type DeliveryAnswer,
  type Page,
  type Release,
} from '@ratatoskr/site-sdk';

// The sites gateway forwards `/_r/*` to Edge, so the delivery API is on the origin of the site. The
// client sends no credential, not even a cookie of this origin.
const baseUrl = '/_r';
const client = createContentClient({ baseUrl, site: __RATATOSKR_SITE_ID__ });

// The template sends no `If-None-Match`, so a 304 is not expected. The browser cache revalidates.
function bodyOf<T>(answer: DeliveryAnswer<T>): T {
  if (answer.status !== 200) throw new Error('The delivery API answered 304 with no body.');
  return answer.body;
}

export async function readRelease(): Promise<Release> {
  return bodyOf(await client.release());
}

export async function readPage(slug: string): Promise<Page> {
  return bodyOf(await client.page(slug));
}

// The address of the bytes of one asset of the current release.
export function assetUrl(sha256: string): string {
  return `${baseUrl}/v1/sites/${encodeURIComponent(__RATATOSKR_SITE_ID__)}/content/assets/${encodeURIComponent(sha256)}`;
}
