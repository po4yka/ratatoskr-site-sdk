import type { components } from '../generated/platform.js';
import { checkedSite, defaultFetch, siteApiError, stateChange } from './request.js';

// The owner sign-in of a site (workspace change `add-site-owner-editing-and-live`, design D1):
// an authorization code with PKCE S256, approved in the web client by the owner's primary session.
//
// 1. `beginSignIn` makes a verifier, keeps it in `sessionStorage` of the site origin only, and
//    gives back the address of the consent page of the web client with the S256 challenge.
// 2. The web client redirects to the reserved page `/.ratatoskr/sign-in/?code=<code>`.
// 3. On that page `completeSignIn` removes the code from the address, then posts the code and the
//    verifier to `/v1/sites/{site}/sessions`. The answer sets the owner cookie.
//
// The functions do not move the page; the caller does, so the order of the steps stays visible.

export type SiteSessionRequest = components['schemas']['SiteSessionRequest'];
export type SiteSessionOpened = components['schemas']['SiteSessionOpened'];

export const verifierStorageKey = 'ratatoskr.site.sign-in.verifier';

export interface SignInStart {
  // The site id.
  site: string;
  // The origin of the web client, for example `https://ratatoskr.example`.
  webUrl: string;
  // The path on the site to come back to, for example `/#/handbook/start`.
  returnPath: string;
}

export interface SignInCallback {
  site: string;
  // The prefix in front of `/v1/sites/...`: `/_r` behind the sites gateway.
  baseUrl: string;
  fetch?: typeof fetch;
}

export type SignInWindow = Pick<Window, 'location' | 'history' | 'sessionStorage' | 'crypto'>;

// A path on this site. `//` and `\` would let a browser read the rest as another host.
export function isSitePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
}

function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

// Gives back the address of the consent page. 32 random bytes give a verifier of 43 characters,
// the shortest that RFC 7636 allows.
export async function beginSignIn(start: SignInStart, win: SignInWindow = window): Promise<string> {
  const site = checkedSite(start.site);
  if (!isSitePath(start.returnPath)) {
    throw new RangeError(`${JSON.stringify(start.returnPath)} is not a path on this site.`);
  }
  const verifier = base64url(win.crypto.getRandomValues(new Uint8Array(32)));
  const digest = await win.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  win.sessionStorage.setItem(verifierStorageKey, verifier);
  const address = new URL(`/sites/${site}/sign-in`, start.webUrl);
  address.searchParams.set('challenge', base64url(new Uint8Array(digest)));
  address.searchParams.set('return', start.returnPath);
  return address.href;
}

// Removes the code from the address and from the history entry, and the verifier from the
// storage, before any request, so that neither can be read again or sent twice.
function takeCodeAndVerifier(win: SignInWindow): { code: string | null; verifier: string | null } {
  const address = new URL(win.location.href);
  const code = address.searchParams.get('code');
  address.searchParams.delete('code');
  win.history.replaceState(null, '', `${address.pathname}${address.search}${address.hash}`);
  const verifier = win.sessionStorage.getItem(verifierStorageKey);
  win.sessionStorage.removeItem(verifierStorageKey);
  return { code, verifier };
}

// Redeems the code. The answer holds a `return_path` that is a path on this site, or `/`.
export async function completeSignIn(
  callback: SignInCallback,
  win: SignInWindow = window,
): Promise<SiteSessionOpened> {
  const site = checkedSite(callback.site);
  const { code, verifier } = takeCodeAndVerifier(win);
  if (code === null || verifier === null) {
    throw new Error('The sign-in has no code or no verifier. Start it again from the site.');
  }
  const body: SiteSessionRequest = { code, verifier };
  const response = await (callback.fetch ?? defaultFetch())(
    `${callback.baseUrl}/v1/sites/${site}/sessions`,
    stateChange(JSON.stringify(body), 'application/json'),
  );
  if (response.status !== 201) throw await siteApiError(response);
  const opened = (await response.json()) as SiteSessionOpened;
  return { ...opened, return_path: isSitePath(opened.return_path) ? opened.return_path : '/' };
}
