import { createHash } from 'node:crypto';

import { Window } from 'happy-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { fakeFetch } from '../../tests/fake-fetch.js';
import { beginSignIn, completeSignIn, verifierStorageKey, type SignInWindow } from './sign-in.js';

// SITE-027 task 10.1 (workspace design D1): the verifier stays on the site origin, and the code
// leaves the address bar before the callback page posts it.
const opened = { return_path: '/#/handbook/start', expires_at: '2026-10-15T21:30:00Z' };

let win: Window;

function openWindow(url: string): SignInWindow {
  win = new Window({ url });
  return win as unknown as SignInWindow;
}

afterEach(async () => {
  await win.happyDOM.close();
});

function callbackWindow(): SignInWindow {
  const site = openWindow('https://docs.example.test/.ratatoskr/sign-in/?code=K1');
  win.sessionStorage.setItem(verifierStorageKey, 'V1');
  return site;
}

describe('the owner sign-in', () => {
  it('stores_verifier_only_in_session_storage', async () => {
    const site = openWindow('https://docs.example.test/handbook/');

    const address = await beginSignIn(
      { site: 'docs', webUrl: 'https://ratatoskr.example.test', returnPath: '/#/handbook/start' },
      site,
    );

    expect(win.sessionStorage.length).toBe(1);
    const verifier = win.sessionStorage.getItem(verifierStorageKey) ?? '';
    // RFC 7636: 43 to 128 characters of the unreserved set.
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(win.localStorage.length).toBe(0);
    expect(win.document.cookie).toBe('');
    const url = new URL(address);
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://ratatoskr.example.test/sites/docs/sign-in',
    );
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(url.searchParams.get('challenge')).toBe(challenge);
    expect(url.searchParams.get('return')).toBe('/#/handbook/start');
    expect(address).not.toContain(verifier);
  });

  it('callback_removes_code_from_history_before_post', async () => {
    const site = callbackWindow();
    let searchAtPost: string | undefined;
    const edge = fakeFetch(() => {
      searchAtPost = win.location.search;
      return Response.json(opened, { status: 201 });
    });

    const answer = await completeSignIn({ site: 'docs', baseUrl: '/_r', fetch: edge.fetch }, site);

    expect(win.location.search).not.toContain('code');
    expect(searchAtPost).toBe('');
    expect(win.location.pathname).toBe('/.ratatoskr/sign-in/');
    expect(answer).toEqual(opened);
  });

  it('callback_sends_site_request_header', async () => {
    const site = callbackWindow();
    const edge = fakeFetch(() => Response.json(opened, { status: 201 }));

    await completeSignIn({ site: 'docs', baseUrl: '/_r', fetch: edge.fetch }, site);

    expect(edge.sent[0]?.headers['x-ratatoskr-site-request']).toBe('1');
    expect(edge.sent).toEqual([
      {
        url: '/_r/v1/sites/docs/sessions',
        method: 'POST',
        // Same-origin, so that the browser keeps the cookie that the answer sets.
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-ratatoskr-site-request': '1' },
        body: JSON.stringify({ code: 'K1', verifier: 'V1' }),
      },
    ]);
    // The verifier works once.
    expect(win.sessionStorage.getItem(verifierStorageKey)).toBeNull();
  });
});
