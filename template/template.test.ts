import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// SITE-027 task 10.1 (workspace design D1, SITE-026 design D7): every bundle built from the
// template ships the sign-in callback page under the reserved path `/.ratatoskr/`.
const templateDir = fileURLToPath(new URL('.', import.meta.url));

let outDir: string;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'ratatoskr-template-build-'));
  await build({ root: templateDir, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
}, 60_000);

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('the starter template build', () => {
  it('template_ships_reserved_sign_in_page', () => {
    const page = join(outDir, '.ratatoskr', 'sign-in', 'index.html');

    expect(existsSync(page)).toBe(true);
    const html = readFileSync(page, 'utf8');
    // The code is in the address of this page, so the page sends no referrer.
    expect(html).toContain('<meta name="referrer" content="no-referrer"');
    expect(html).toMatch(/<script type="module"[^>]* src="\/assets\/[^"]+\.js"/);
  });
});
