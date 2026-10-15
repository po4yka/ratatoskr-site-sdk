import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ExecCall, ExecResult } from '../src/cli/deps.js';
import { run } from '../src/cli/run.js';
import { writeTar } from '../src/cli/tar.js';
import { buildFiles, commit, failed, fakeCli, ok } from './fake-cli.js';

// SITE-026 task 9.4 (workspace design D3, spec `site-bundles`): `ratatoskr-site deploy` verifies
// the artifact on the machine where it runs before it sends a byte to Edge, and `login` keeps the
// device secret in the credential store. The fake `oras`, the fake `gh` and the fake credential
// store come from `fake-cli.ts`; the stub Edge is a `fetch` that records each request.
const repository = 'owner/docs-site';
const image = `ghcr.io/${repository}`;
const digest = `sha256:${'e'.repeat(64)}`;
const api = 'https://ratatoskr.example.test';
const device = { api, device_id: '018f0000-0000-7000-8000-0000000000a1', device_secret: 'root-1' };
const signerWorkflow = 'po4yka/ratatoskr-site-sdk/.github/workflows/reusable-site-bundle.yml';
const later = '2026-10-15T21:00:00Z';

// A bundle of the fixture build output whose manifest names `site`.
function bundleTar(site: string): Uint8Array {
  const files = Object.entries(buildFiles)
    .map(([path, text]) => ({ path, bytes: Buffer.from(text) }))
    .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const manifest = {
    site_id: site,
    repository,
    commit,
    entry_document: 'index.html',
    entry_fallback: true,
    files: files.map(({ path, bytes }) => ({
      path,
      size_bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      hashed: path.startsWith('assets/'),
    })),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  return writeTar([{ path: 'ratatoskr-bundle.json', bytes: manifestBytes }, ...files]);
}

// The fake `oras` and the fake `gh`: `oras pull` writes `bundle.tar` into its `-o` folder, and
// `gh attestation verify` accepts the digest only when `attested` is true.
function tools(bundle: { tar: Uint8Array; attested: boolean }) {
  return async (call: ExecCall): Promise<ExecResult> => {
    const [verb] = call.args;
    if (call.command === 'oras' && verb === 'resolve') return ok(`${digest}\n`);
    if (call.command === 'oras' && verb === 'pull') {
      await writeFile(join(call.args[call.args.indexOf('-o') + 1] ?? '', 'bundle.tar'), bundle.tar);
      return ok();
    }
    if (call.command === 'gh') {
      return bundle.attested ? ok() : failed('Error: no attestation matches the digest');
    }
    return failed(`unexpected ${call.command}`);
  };
}

interface EdgeRequest {
  method: string;
  path: string;
  authorization: string | null;
  contentType: string | null;
  body: unknown;
}

const answers: Record<string, () => Response> = {
  '/v1/devices/pair': () =>
    Response.json(
      {
        ...device,
        user_id: 'u-1',
        credential: 'pairing-session',
        expires_at: later,
        refresh_token: 'refresh-1',
        refresh_expires_at: later,
      },
      { status: 201 },
    ),
  '/v1/sessions/device': () =>
    Response.json(
      {
        user_id: 'u-1',
        device_id: device.device_id,
        credential: 'device-session-1',
        expires_at: later,
        refresh_token: 'refresh-2',
        refresh_expires_at: later,
      },
      { status: 201 },
    ),
  '/v1/sites/docs/deploys': () =>
    Response.json(
      { site_id: 'docs', commit, file_count: 6, size_bytes: 300, created: true },
      { status: 201 },
    ),
  [`/v1/sites/docs/deploys/${commit}/activate`]: () =>
    Response.json({ site_id: 'docs', current_commit: commit }),
};

function stubEdge() {
  const requests: EdgeRequest[] = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    requests.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      authorization: headers.get('authorization'),
      contentType: headers.get('content-type'),
      body: init?.body,
    });
    const answer = url.origin === api ? answers[url.pathname] : undefined;
    return Promise.resolve(answer?.() ?? Response.json({ code: 'not_found' }, { status: 404 }));
  };
  return { fetch: fetchImpl as typeof fetch, requests };
}

const deployTo = (site: string) => ['deploy', '--site', site, '--commit', commit];

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
