import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { run } from '../src/cli/run.js';
import type { BundleManifest } from '../src/contracts/sites/bundle-manifest.v1.js';
import { buildFiles, buildOutput, commit, fakeCli } from './fake-cli.js';

// SITE-026 task 9.1 (workspace design D4, spec `site-bundles`): the manifest step of the reusable
// bundle workflow, run against a fixture build output.
let dir: string;

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function readManifest(): Promise<BundleManifest | undefined> {
  const text = await readFile(join(dir, 'ratatoskr-bundle.json'), 'utf8').catch(() => undefined);
  return text === undefined ? undefined : (JSON.parse(text) as BundleManifest);
}

const manifestStep = (hashedGlobs: string): string[] => [
  'bundle',
  'manifest',
  '--dir',
  dir,
  '--site',
  'docs',
  '--repository',
  'owner/docs-site',
  '--commit',
  commit,
  '--hashed-globs',
  hashedGlobs,
];

const fileOf = (path: string, hashed: boolean) => {
  const bytes = Buffer.from(buildFiles[path] ?? '');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { path, size_bytes: bytes.length, sha256, hashed };
};

describe('the manifest step', () => {
  it('marks files that match hashed-globs', async () => {
    dir = await buildOutput();
    const cli = fakeCli({ env: { GITHUB_SHA: commit } });

    const code = await run(manifestStep('assets/**'), cli.deps);

    const manifest = await readManifest();
    const hashed = manifest?.files.filter((file) => file.hashed).map((file) => file.path);
    expect(hashed).toEqual(['assets/fonts/inter-1b2c.woff2', 'assets/index-4f2a9c.js']);
    expect(code).toBe(0);
    // Every file once, in ascending order of path, and the manifest itself not in the list.
    expect(manifest).toEqual({
      site_id: 'docs',
      repository: 'owner/docs-site',
      commit,
      entry_document: 'index.html',
      entry_fallback: true,
      files: [
        fileOf('.ratatoskr/sign-in/index.html', false),
        fileOf('assets/fonts/inter-1b2c.woff2', true),
        fileOf('assets/index-4f2a9c.js', true),
        fileOf('favicon.svg', false),
        fileOf('index.html', false),
        fileOf('notes/assets.html', false),
      ],
    });
  });

  it('fails when the manifest commit differs from GITHUB_SHA', async () => {
    dir = await buildOutput();
    const cli = fakeCli({ env: { GITHUB_SHA: '0'.repeat(40) } });

    const code = await run(manifestStep('assets/**'), cli.deps);

    expect(code).not.toBe(0);
    expect(existsSync(join(dir, 'ratatoskr-bundle.json'))).toBe(false);
    expect(cli.err.join('\n')).toContain('GITHUB_SHA');
  });
});
