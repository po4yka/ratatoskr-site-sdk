import { describe, expect, it } from 'vitest';

import { run } from '../src/cli/run.js';
import { commit, fakeCli, ok } from './fake-cli.js';
import { bundleTar, deployTo, device, digest, repository, stubEdge, tools } from './fake-edge.js';

// Unit orchestration only. A real signed public artifact is a separate acceptance gate.
const proof = { mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json', fixture: 'untrusted' };

function scenario(bundle: unknown) {
  const edge = stubEdge();
  const original = tools({ tar: bundleTar('docs'), attested: true });
  const cli = fakeCli({
    fetch: edge.fetch,
    exec: (call) => (call.command === 'gh' ? ok(JSON.stringify(bundle)) : original(call)),
  });
  cli.secrets.set('docs', JSON.stringify(device));
  return { cli, edge };
}

describe('deploy provenance', () => {
  it('sends the immutable digest and proof', async () => {
    const { cli, edge } = scenario([{ attestation: { bundle: proof } }]);
    const code = await run([...deployTo('docs'), '--repository', repository], cli.deps);
    expect(code).toBe(0);
    const request = edge.requests.find((value) => value.path === '/v1/sites/docs/deploys');
    expect(request?.contentType).toBe('application/json');
    expect(JSON.parse(String(request?.body))).toEqual({
      commit,
      artifact_sha256: digest.slice('sha256:'.length),
      attestation_bundle: proof,
    });
  });

  it('rejects a missing proof before login', async () => {
    const { cli, edge } = scenario([]);
    const code = await run([...deployTo('docs'), '--repository', repository], cli.deps);
    expect(code).toBe(1);
    expect(edge.requests).toEqual([]);
  });

  it('cannot override the approved origin', async () => {
    const { cli, edge } = scenario([{ attestation: { bundle: proof } }]);
    const code = await run(
      [...deployTo('docs'), '--repository', 'https://foreign.example/owner/site'],
      cli.deps,
    );
    expect(code).toBe(1);
    expect(cli.calls).toEqual([]);
    expect(edge.requests).toEqual([]);
  });
});
