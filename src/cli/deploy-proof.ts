import type { ExpectedBundle } from './bundle-check.js';
import { CliError } from './bundle-paths.js';
import type { CliDeps } from './deps.js';

export const signerWorkflow =
  'po4yka/ratatoskr-site-sdk/.github/workflows/reusable-site-bundle.yml';
export const signerCommit = '89331e6aa0b845c3565c1d9785b0dd5038e2de81';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Early client feedback. The server verifies this public proof independently with its own policy.
export async function verifiedProof(
  options: { expected: ExpectedBundle; reference: string },
  deps: CliDeps,
): Promise<Record<string, unknown>> {
  const { expected, reference } = options;
  const result = await deps.exec({
    command: 'gh',
    args: [
      'attestation',
      'verify',
      `oci://${reference}`,
      '--repo',
      expected.repository,
      '--source-digest',
      expected.commit,
      '--signer-workflow',
      signerWorkflow,
      '--signer-digest',
      signerCommit,
      '--deny-self-hosted-runners',
      '--bundle-from-oci',
      '--cert-oidc-issuer',
      'https://token.actions.githubusercontent.com',
      '--predicate-type',
      'https://slsa.dev/provenance/v1',
      '--format',
      'json',
    ],
  });
  if (result.code !== 0) throw new CliError('The attestation is not valid.');
  return proofFromOutput(result.stdout);
}

function proofFromOutput(text: string): Record<string, unknown> {
  let output: unknown;
  try {
    output = JSON.parse(text);
  } catch {
    throw new CliError('The attestation verifier returned no proof.');
  }
  if (Array.isArray(output)) {
    for (const candidate of output) {
      if (!record(candidate) || !record(candidate.attestation)) continue;
      const bundle = candidate.attestation.bundle;
      if (record(bundle) && Object.keys(bundle).length > 0) return bundle;
    }
  }
  throw new CliError('The attestation verifier returned no proof.');
}
