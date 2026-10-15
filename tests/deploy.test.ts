import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { run } from '../src/cli/run.js';
import { commit, fakeCli } from './fake-cli.js';
import {
  api,
  bundleTar,
  deployTo,
  device,
  digest,
  image,
  repository,
  signerWorkflow,
  stubEdge,
  tools,
} from './fake-edge.js';

// SITE-026 task 9.4 (workspace design D3, spec `site-bundles`): `ratatoskr-site deploy` verifies
// the artifact on the machine where it runs before it sends a byte to Edge, and `login` keeps the
// device secret in the credential store. The fake `oras`, the fake `gh` and the fake credential
// store come from `fake-cli.ts`; the stub Edge is a `fetch` that records each request.

let cwd: string | undefined;

afterEach(async () => {
  if (cwd !== undefined) await rm(cwd, { recursive: true, force: true });
  cwd = undefined;
});

describe('ratatoskr-site deploy', () => {
  it('refuses an artifact without a valid attestation before any request', async () => {
    const edge = stubEdge();
    const cli = fakeCli({
      exec: tools({ tar: bundleTar('docs'), attested: false }),
      fetch: edge.fetch,
    });
    cli.secrets.set('docs', JSON.stringify(device));

    const code = await run([...deployTo('docs'), '--repository', repository], cli.deps);

    expect(code).not.toBe(0);
    expect(edge.requests).toEqual([]);
    expect(cli.err.join('\n')).toContain('attestation');
  });

  it('refuses a bundle for another site', async () => {
    const edge = stubEdge();
    const cli = fakeCli({
      exec: tools({ tar: bundleTar('docs'), attested: true }),
      fetch: edge.fetch,
    });
    cli.secrets.set('blog', JSON.stringify(device));

    const code = await run([...deployTo('blog'), '--repository', repository], cli.deps);

    expect(code).not.toBe(0);
    expect(edge.requests).toEqual([]);
    expect(cli.err.join('\n')).toContain('docs');
  });

  it('uploads then activates', async () => {
    const tar = bundleTar('docs');
    const edge = stubEdge();
    const cli = fakeCli({ exec: tools({ tar, attested: true }), fetch: edge.fetch });
    cli.secrets.set('docs', JSON.stringify(device));

    const code = await run([...deployTo('docs'), '--repository', repository], cli.deps);

    const siteRequests = edge.requests.filter((request) => request.path.startsWith('/v1/sites/'));
    expect(
      siteRequests.map((request) => [request.method, request.path, request.authorization]),
    ).toEqual([
      ['POST', '/v1/sites/docs/deploys', 'Bearer device-session-1'],
      ['POST', `/v1/sites/docs/deploys/${commit}/activate`, 'Bearer device-session-1'],
    ]);
    expect(code).toBe(0);
    expect(siteRequests[0]?.contentType).toBe('application/x-tar');
    expect(Buffer.from(siteRequests[0]?.body as Uint8Array).equals(Buffer.from(tar))).toBe(true);
    // The device session comes from the root secret in the credential store, first of all.
    expect(edge.requests[0]?.path).toBe('/v1/sessions/device');
    expect(JSON.parse(String(edge.requests[0]?.body))).toEqual({
      device_id: device.device_id,
      device_secret: device.device_secret,
    });
    // The attestation binds the pulled digest to the repository, the commit and this workflow.
    expect(cli.calls.find((call) => call.command === 'gh')?.args).toEqual([
      'attestation',
      'verify',
      `oci://${image}@${digest}`,
      '--repo',
      repository,
      '--source-digest',
      commit,
      '--signer-workflow',
      signerWorkflow,
      '--deny-self-hosted-runners',
    ]);
  });
});

describe('ratatoskr-site login', () => {
  it('stores the device secret outside the repository', async () => {
    cwd = await mkdtemp(join(tmpdir(), 'ratatoskr-site-repository-'));
    const edge = stubEdge();
    const cli = fakeCli({ fetch: edge.fetch, cwd });

    const code = await run(
      ['login', '--pairing-code', 'PAIR-1234', '--site', 'docs', '--api', api],
      cli.deps,
    );

    expect(JSON.parse(cli.secrets.get('docs') ?? 'null')).toEqual(device);
    expect(await readdir(cwd)).toEqual([]);
    expect(code).toBe(0);
    expect(edge.requests.map((request) => [request.method, request.path])).toEqual([
      ['POST', '/v1/devices/pair'],
    ]);
    expect(JSON.parse(String(edge.requests[0]?.body))).toMatchObject({
      code: 'PAIR-1234',
      kind: 'site_deployer',
    });
    expect([...cli.out, ...cli.err].join('\n')).not.toContain(device.device_secret);
  });
});
