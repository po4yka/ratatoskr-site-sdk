import type { components } from '../generated/platform.js';

// RED stub of SITE-027 task 10.1: the functions do nothing. Task 10.2 replaces it.

export type SiteSessionOpened = components['schemas']['SiteSessionOpened'];

export const verifierStorageKey = 'ratatoskr.site.sign-in.verifier';

export interface SignInStart {
  site: string;
  webUrl: string;
  returnPath: string;
}

export interface SignInCallback {
  site: string;
  baseUrl: string;
  fetch?: typeof fetch;
}

export type SignInWindow = Pick<Window, 'location' | 'history' | 'sessionStorage' | 'crypto'>;

export function beginSignIn(start: SignInStart, win: SignInWindow): Promise<string> {
  void start;
  void win;
  return Promise.resolve('');
}

export function completeSignIn(
  callback: SignInCallback,
  win: SignInWindow,
): Promise<SiteSessionOpened> {
  void callback;
  void win;
  return Promise.resolve({ return_path: '/', expires_at: '' });
}
