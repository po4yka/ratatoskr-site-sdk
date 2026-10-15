import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { run } from '../src/cli/run.js';
import { buildOutput, commit, failed, fakeCli, ok } from './fake-cli.js';

// SITE-026 task 9.2 (workspace spec `site-bundles`, "A published tag SHALL NOT move to another
// digest"): the publish step of the reusable bundle workflow, with a fake `oras`.
const image = 'ghcr.io/owner/docs-site';
const existing = `sha256:${'d'.repeat(64)}`;

let dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe('the publish step', () => {
  it('keeps an existing tag', async () => {
    const dir = await buildOutput();
    const outputs = await mkdtemp(join(tmpdir(), 'ratatoskr-github-output-'));
    dirs = [dir, outputs];
    const githubOutput = join(outputs, 'output');
    // The fake `oras` has the tag: `manifest fetch` answers its descriptor.
    const cli = fakeCli({
      env: { GITHUB_SHA: commit, GITHUB_OUTPUT: githubOutput },
      exec: (call) =>
        call.command === 'oras' && call.args[0] === 'manifest'
          ? ok(
              JSON.stringify({
                mediaType: 'application/vnd.oci.image.manifest.v1+json',
                digest: existing,
                size: 712,
              }),
            )
          : failed('not expected'),
    });

    const code = await run(
      ['bundle', 'publish', '--dir', dir, '--image', image, '--commit', commit],
      cli.deps,
    );

    expect(cli.calls.map((call) => [call.command, ...call.args])).toEqual([
      ['oras', 'manifest', 'fetch', '--descriptor', `${image}:sha-${commit}`],
    ]);
    expect(cli.calls.filter((call) => call.args[0] === 'push')).toEqual([]);
    expect(code).toBe(0);
    expect(cli.out.join('\n')).toContain(`${image}:sha-${commit} already exists at ${existing}`);
    // The workflow attests only a digest that this run pushed.
    const written = await readFile(githubOutput, 'utf8');
    expect(written).toContain('attest=false\n');
    expect(written).toContain(`digest=${existing}\n`);
  });

  // SITE-026 review M2: only a not-found answer means that the tag is absent.
  it('stops when oras cannot tell whether the tag exists', async () => {
    const dir = await buildOutput();
    dirs = [dir];
    const cli = fakeCli({
      env: { GITHUB_SHA: commit },
      exec: (call) =>
        call.args[0] === 'manifest'
          ? failed(
              `Error: failed to fetch the content of "${image}:sha-${commit}": 500 Internal Server Error`,
            )
          : ok(`${existing}\n`),
    });
    // A manifest exists, so the step could push.
    const manifest = ['--site', 'docs', '--repository', 'owner/docs-site', '--commit', commit];
    expect(await run(['bundle', 'manifest', '--dir', dir, ...manifest], cli.deps)).toBe(0);

    const code = await run(
      ['bundle', 'publish', '--dir', dir, '--image', image, '--commit', commit],
      cli.deps,
    );

    expect(cli.calls.filter((call) => call.args[0] === 'push')).toEqual([]);
    expect(code).not.toBe(0);
    expect(cli.err.join('\n')).toContain('500 Internal Server Error');
  });

  it('pushes when oras answers that the tag is not found', async () => {
    const dir = await buildOutput();
    const outputs = await mkdtemp(join(tmpdir(), 'ratatoskr-github-output-'));
    dirs = [dir, outputs];
    const githubOutput = join(outputs, 'output');
    const pushed = `sha256:${'f'.repeat(64)}`;
    const cli = fakeCli({
      env: { GITHUB_SHA: commit, GITHUB_OUTPUT: githubOutput },
      exec: (call) =>
        call.args[0] === 'manifest'
          ? failed(`Error: ${image}:sha-${commit}: not found`)
          : ok(`${pushed}\n`),
    });
    const manifest = ['--site', 'docs', '--repository', 'owner/docs-site', '--commit', commit];
    expect(await run(['bundle', 'manifest', '--dir', dir, ...manifest], cli.deps)).toBe(0);

    const code = await run(
      ['bundle', 'publish', '--dir', dir, '--image', image, '--commit', commit],
      cli.deps,
    );

    expect(cli.calls.map((call) => call.args[0])).toEqual(['manifest', 'push']);
    expect(code).toBe(0);
    expect(await readFile(githubOutput, 'utf8')).toContain(`digest=${pushed}\nattest=true\n`);
  });

  // SITE-026 review, low findings.
  it('refuses an existing tag whose digest is not a sha256 digest', async () => {
    const dir = await buildOutput();
    dirs = [dir];
    const cli = fakeCli({
      env: { GITHUB_SHA: commit },
      exec: () => ok(JSON.stringify({ digest: 'sha256:short' })),
    });

    const code = await run(
      ['bundle', 'publish', '--dir', dir, '--image', image, '--commit', commit],
      cli.deps,
    );

    expect(code).not.toBe(0);
    expect(cli.out.join('\n')).not.toContain('already exists');
  });

  it('refuses a manifest path under _r/ before the push', async () => {
    const dir = await buildOutput();
    dirs = [dir];
    await mkdir(join(dir, '_r'));
    await writeFile(join(dir, '_r', 'x'), 'x');
    // A manifest that lists `_r/x`, written by hand: the manifest step would refuse it.
    const sha256 = createHash('sha256').update('x').digest('hex');
    const manifest = {
      site_id: 'docs',
      repository: 'owner/docs-site',
      commit,
      entry_document: '_r/x',
      entry_fallback: false,
      files: [{ path: '_r/x', size_bytes: 1, sha256, hashed: false }],
    };
    await writeFile(join(dir, 'ratatoskr-bundle.json'), JSON.stringify(manifest));
    const cli = fakeCli({
      env: { GITHUB_SHA: commit },
      exec: (call) => (call.args[0] === 'manifest' ? failed('Error: not found') : ok(existing)),
    });

    const code = await run(
      ['bundle', 'publish', '--dir', dir, '--image', image, '--commit', commit],
      cli.deps,
    );

    expect(cli.calls.map((call) => call.args[0])).toEqual(['manifest']);
    expect(code).not.toBe(0);
    expect(cli.err.join('\n')).toContain('_r/x');
  });
});
