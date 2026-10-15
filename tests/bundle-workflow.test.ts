import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
});
