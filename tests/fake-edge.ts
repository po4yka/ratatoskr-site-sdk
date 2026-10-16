import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ExecCall, ExecResult } from '../src/cli/deps.js';
import { writeTar } from '../src/cli/tar.js';
import { buildFiles, commit, failed, ok } from './fake-cli.js';

// The parts of a deploy test: the fixture bundle, the fake `oras` and `gh`, and the stub Edge.
export const repository = 'owner/docs-site';
export const image = `ghcr.io/${repository}`;
export const digest = `sha256:${'e'.repeat(64)}`;
export const api = 'https://ratatoskr.example.test';
export const device = {
  api,
  device_id: '018f0000-0000-7000-8000-0000000000a1',
  device_secret: 'root-1',
};
export const signerWorkflow =
  'po4yka/ratatoskr-site-sdk/.github/workflows/reusable-site-bundle.yml';
export const signerCommit = '89331e6aa0b845c3565c1d9785b0dd5038e2de81';
export const attestationBundle = {
  mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
  fixture: 'untrusted',
};
const later = '2026-10-15T21:00:00Z';

// A bundle of the fixture build output whose manifest names `site`.
export function bundleTar(site: string): Uint8Array {
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
export function tools(bundle: { tar: Uint8Array; attested: boolean }) {
  return async (call: ExecCall): Promise<ExecResult> => {
    const [verb] = call.args;
    if (call.command === 'oras' && verb === 'resolve') return ok(`${digest}\n`);
    if (call.command === 'oras' && verb === 'pull') {
      await writeFile(join(call.args[call.args.indexOf('-o') + 1] ?? '', 'bundle.tar'), bundle.tar);
      return ok();
    }
    if (call.command === 'gh') {
      return bundle.attested
        ? ok(JSON.stringify([{ attestation: { bundle: attestationBundle } }]))
        : failed('Error: no attestation matches the digest');
    }
    return failed(`unexpected ${call.command}`);
  };
}

export interface EdgeRequest {
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

export function stubEdge() {
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

export const deployTo = (site: string) => ['deploy', '--site', site, '--commit', commit];
