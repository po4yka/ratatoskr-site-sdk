import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

import { fakeFetch } from '../../tests/fake-fetch.js';
import { completeSignIn, isSitePath, verifierStorageKey, type SignInWindow } from './sign-in.js';

// SITE-027 review M1: the return path of a sign-in stays on the site. A browser removes a tab, a
// line feed and a carriage return from a URL and reads `\` as `/`, so `/\t/evil.example` would go
// to evil.example.
describe('the return path of a sign-in', () => {
  it.each([
    ['a tab', '/\t/evil.example'],
    ['a line feed', '/\n/evil.example'],
    ['a carriage return', '/\r/evil.example'],
    ['two slashes', '//evil.example'],
    ['a backslash', '/\\evil.example'],
    ['no slash at the start', 'evil.example'],
  ])('refuses a path with %s', (_name, path) => {
    expect(isSitePath(path)).toBe(false);
  });

  it.each(['/', '/#/handbook/start', '/docs/?tab=1', '/%2F%2Fevil.example'])(
    'accepts %s, which stays on the site',
    (path) => {
      expect(isSitePath(path)).toBe(true);
    },
  );

  it('replaces a JSON-encoded tab in the answer with /', async () => {
    const win = new Window({ url: 'https://docs.example.test/.ratatoskr/sign-in/?code=K1' });
    win.sessionStorage.setItem(verifierStorageKey, 'V1');
    // `\u0009` in the JSON text is a tab after the parse.
    const edge = fakeFetch(
      () =>
        new Response(
          '{"return_path":"/\\u0009/evil.example","expires_at":"2026-10-15T21:30:00Z"}',
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    try {
      const opened = await completeSignIn(
        { site: 'docs', baseUrl: '/_r', fetch: edge.fetch },
        win as unknown as SignInWindow,
      );
      expect(opened.return_path).toBe('/');
    } finally {
      await win.happyDOM.close();
    }
  });
});
