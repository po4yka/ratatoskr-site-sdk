import { readFileSync } from 'node:fs';

import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  readFileSync: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.mocked(readFileSync).mockReset();
});

it.each(['3e++20', '3e+'])('rejects malformed manifest exponent %s', async (value) => {
  vi.mocked(readFileSync).mockReturnValue(`site_id = "docs"\nextra = ${value}\n`);

  await expect(import('./vite.config.js')).rejects.toThrow(/numeric (literal|value)/);
});

it.each(['3e+20', '3e-20'])('accepts valid exponent %s and keeps the site id', async (value) => {
  vi.mocked(readFileSync).mockReturnValue(`site_id = "docs"\nextra = ${value}\n`);

  const { default: config } = await import('./vite.config.js');
  expect(config.define?.__RATATOSKR_SITE_ID__).toBe('"docs"');
});
