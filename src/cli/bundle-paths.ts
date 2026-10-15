import { createHash } from 'node:crypto';

// The rules of a bundle that both the bundle workflow and the deploy command check (contract
// `sites/bundle-manifest.v1`, workspace spec `site-bundles`).

export const manifestName = 'ratatoskr-bundle.json';
export const bundleMediaType = 'application/vnd.ratatoskr.site-bundle.v1';
export const bundleLayerMediaType = `${bundleMediaType}.tar`;
export const bundleFileName = 'bundle.tar';

export const sitePattern = /^[a-z0-9-]{3,40}$/;
export const commitPattern = /^[0-9a-f]{40}$/;
export const repositoryPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;

// An error that the command reports in one line, with exit status 1.
export class CliError extends Error {
  override name = 'CliError';
}

export function checked(value: string, rule: { name: string; pattern: RegExp }): string {
  if (!rule.pattern.test(value))
    throw new CliError(`${JSON.stringify(value)} is not a ${rule.name}.`);
  return value;
}

// Why `path` cannot be in a bundle, or `null` when it can. Relative, NFC, at most 1024 UTF-8 bytes,
// segments separated by `/` with no empty, `.` or `..` segment, no backslash and no control
// character, and not under `_r/`, which the gateway forwards to Edge. `.ratatoskr/` is allowed.
export function bundlePathProblem(path: string): string | null {
  if (path !== path.normalize('NFC')) return 'is not in Unicode NFC';
  if (Buffer.byteLength(path) > 1024) return 'is longer than 1024 bytes';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/u.test(path)) return 'holds a control character or a backslash';
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return 'has an empty, "." or ".." segment';
  }
  if (segments[0] === '_r') return 'is under _r/, which the gateway forwards to Edge';
  return null;
}

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

// Ascending order of the UTF-8 bytes of the path, as the contract asks.
export const byPath = (a: { path: string }, b: { path: string }): number =>
  Buffer.compare(Buffer.from(a.path), Buffer.from(b.path));
