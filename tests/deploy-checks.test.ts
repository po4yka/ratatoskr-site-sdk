import { describe, expect, it } from 'vitest';

import type { ExecCall } from '../src/cli/deps.js';
import { run } from '../src/cli/run.js';
import { fakeCli, ok } from './fake-cli.js';
import { api, bundleTar, deployTo, device, repository, stubEdge, tools } from './fake-edge.js';

// SITE-026 review, low findings: the deploy command checks the attestation for a GitHub-hosted
// runner, reads the repository only from a real GitHub remote, refuses a damaged stored device,
// and `login` reads a pairing code from stdin.

function deployWith(options: { secret: string; remote?: string }) {
  const edge = stubEdge();
  const fake = tools({ tar: bundleTar('docs'), attested: true });
  const exec = (call: ExecCall) =>
    call.command === 'git' ? ok(`${options.remote ?? ''}\n`) : fake(call);
  const cli = fakeCli({ exec, fetch: edge.fetch });
  cli.secrets.set('docs', options.secret);
  return { edge, cli };
}

describe('ratatoskr-site deploy, checks', () => {
  it('verifies that a GitHub-hosted runner built the artifact', async () => {
    const { cli } = deployWith({ secret: JSON.stringify(device) });

    const code = await run([...deployTo('docs'), '--repository', repository], cli.deps);

    expect(cli.calls.find((call) => call.command === 'gh')?.args).toContain(
      '--deny-self-hosted-runners',
    );
    expect(code).toBe(0);
  });

  it('takes the repository only from a remote on github.com', async () => {
    const { edge, cli } = deployWith({
      secret: JSON.stringify(device),
      remote: 'https://evil.example/github.com/owner/docs-site.git',
    });

    const code = await run(deployTo('docs'), cli.deps);

    expect(code).not.toBe(0);
    expect(cli.calls.filter((call) => call.command !== 'git')).toEqual([]);
    expect(edge.requests).toEqual([]);
  });

  it('reads the repository from a GitHub remote', async () => {
    const { cli } = deployWith({
      secret: JSON.stringify(device),
      remote: 'git@github.com:owner/docs-site.git',
    });

    expect(await run(deployTo('docs'), cli.deps)).toBe(0);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    [
      'an Edge address that is not https',
      JSON.stringify({ ...device, api: 'http://evil.example' }),
    ],
  ])('refuses a stored device with %s before any request', async (_name, secret) => {
    const { edge, cli } = deployWith({ secret });

    const code = await run([...deployTo('docs'), '--repository', repository], cli.deps);

    expect(code).toBe(1);
    expect(edge.requests).toEqual([]);
    expect(cli.calls).toEqual([]);
  });
});

describe('ratatoskr-site login, checks', () => {
  it('reads the pairing code from stdin when it is -', async () => {
    const edge = stubEdge();
    const cli = fakeCli({ fetch: edge.fetch, stdin: 'PAIR-1234\n' });

    const code = await run(
      ['login', '--pairing-code', '-', '--site', 'docs', '--api', api],
      cli.deps,
    );

    expect(JSON.parse(String(edge.requests[0]?.body))).toMatchObject({ code: 'PAIR-1234' });
    expect(code).toBe(0);
  });
});
