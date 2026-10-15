import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Browser } from 'happy-dom';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startStubDelivery, type StubDelivery } from './stub-delivery.js';

// SITE-025 tasks 7.4, 7.7 and 7.9: the template is built as a site would build it, with no change, and
// run against a stub delivery API that serves the contract fixtures of `ratatoskr-contracts`.
const templateDir = fileURLToPath(new URL('..', import.meta.url));
const fixturesDir = fileURLToPath(new URL('../../contracts/fixtures', import.meta.url));

let outDir: string;
let stub: StubDelivery;
let browser: Browser;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'ratatoskr-template-'));
  await build({ root: templateDir, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  stub = await startStubDelivery({
    siteDir: outDir,
    fixturesDir,
    // Two pages that the contract refuses, served as if the sites service had not refused them.
    extraPages: {
      'hostile/javascript-link': 'sites/page/invalid/link-javascript-url.json',
      'hostile/data-image': 'sites/page/invalid/image-data-url.json',
    },
  });
  browser = new Browser({
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
}, 60_000);

afterAll(async () => {
  await browser.close();
  await stub.close();
  await rm(outDir, { recursive: true, force: true });
});

async function open(path: string) {
  const page = browser.newPage();
  await page.goto(new URL(path, stub.origin).href);
  await page.waitUntilComplete();
  return page.mainFrame.document;
}

describe('the starter template', () => {
  it('home page lists the fixture pages', async () => {
    const document = await open('/');

    const links = [...document.querySelectorAll('#app a')].map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    expect(links.sort()).toEqual([
      ['Diagram', '#/handbook/diagram'],
      ['Links', '#/handbook/links'],
      ['References', '#/handbook/references'],
      ['Start here', '#/handbook/start'],
    ]);
  });

  it('a page renders from its ast', async () => {
    const start = await open('/#/handbook/start');
    expect(start.querySelector('#app h1')?.textContent).toBe('Start here');
    expect(start.querySelector('#app .callout-title')?.textContent).toBe('Before you read');

    const links = await open('/#/handbook/links');
    const wikiLink = [...links.querySelectorAll('#app a')].find(
      (a) => a.textContent === 'the start',
    );
    expect(wikiLink?.getAttribute('href')).toBe('#/handbook/start');
    // Only the `html` member of the page carries this attribute, so its absence shows that the
    // view was built from the `ast`.
    expect(links.querySelector('[data-wikilink]')).toBeNull();
  });

  it('a link or an image with a disallowed scheme renders as text', async () => {
    const link = await open('/#/hostile/javascript-link');
    expect(link.querySelector('#app article')?.textContent).toBe('x');
    expect(link.querySelectorAll('#app article [href]')).toHaveLength(0);

    const image = await open('/#/hostile/data-image');
    expect(image.querySelector('#app article')).not.toBeNull();
    expect(image.querySelectorAll('#app article img')).toHaveLength(0);
    expect(image.querySelectorAll('#app article [src]')).toHaveLength(0);
  });

  it.each(['#/..', '#/../release', '#/handbook/./start', '#/handbook//start', '#/handbook/start/'])(
    'the route %s reads nothing and shows the not-found view',
    async (hash) => {
      const before = stub.requests.length;
      const document = await open(`/${hash}`);
      expect(stub.requests.slice(before)).toEqual([]);
      expect(document.querySelector('#app')?.textContent).toBe('This page does not exist.');
    },
  );
});
