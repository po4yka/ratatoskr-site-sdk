import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BundleManifest } from '../contracts/sites/bundle-manifest.v1.js';
import {
  bundleFileName,
  bundleLayerMediaType,
  bundleMediaType,
  bundlePathProblem,
  checked,
  CliError,
  commitPattern,
  manifestName,
  sha256Hex,
} from './bundle-paths.js';
import type { CliDeps } from './deps.js';
import { type TarEntry, writeTar } from './tar.js';

// The publish step of the reusable bundle workflow (workspace spec `site-bundles`): it pushes the
// bundle of a commit to `<image>:sha-<commit>` with `oras`, unless that tag exists. A published tag
// never moves. It writes `image`, `digest` and `attest` to `GITHUB_OUTPUT`, and the workflow
// attests the digest only when `attest` is `true`, that is, when this run pushed it.

export interface PublishOptions {
  // The dir that the manifest step wrote `ratatoskr-bundle.json` into.
  dir: string;
  // The package, for example `ghcr.io/owner/site`.
  image: string;
  commit: string;
}

const digestPattern = /^sha256:[0-9a-f]{64}$/;

// What `oras manifest fetch` prints when the registry has no such tag or no such repository: the
// registry codes MANIFEST_UNKNOWN and NAME_UNKNOWN, or a line that ends with `<ref>: not found`.
// Any other failure, such as a 500, a refused login or a missing credential helper, says nothing
// about the tag, so the step stops instead of pushing over a tag that may exist.
function saysNotFound(stderr: string, ref: string): boolean {
  if (/\b(?:MANIFEST|NAME)_UNKNOWN\b/.test(stderr)) return true;
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s"])${escaped}: not found\\s*$`, 'm').test(stderr);
}

async function output(deps: CliDeps, values: Record<string, string>): Promise<void> {
  const file = deps.env.GITHUB_OUTPUT;
  if (file === undefined) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`);
  await appendFile(file, lines.join(''));
}

// The archive: the manifest first, then every listed file in the order of the manifest. Each file
// is checked again against the manifest, so the archive holds exactly what the manifest lists.
async function bundleEntries(
  options: PublishOptions,
): Promise<{ manifest: BundleManifest; entries: TarEntry[] }> {
  const manifestBytes = await readFile(join(options.dir, manifestName));
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as BundleManifest;
  if (manifest.commit !== options.commit) {
    throw new CliError(`${manifestName} names ${manifest.commit}, not ${options.commit}.`);
  }
  const entries: TarEntry[] = [{ path: manifestName, bytes: manifestBytes }];
  for (const file of manifest.files) {
    // The manifest can be changed after the manifest step, so its paths are checked again.
    const problem = bundlePathProblem(file.path);
    if (problem !== null) throw new CliError(`${file.path} ${problem}.`);
    const bytes = await readFile(join(options.dir, file.path));
    if (bytes.length !== file.size_bytes || sha256Hex(bytes) !== file.sha256) {
      throw new CliError(`${file.path} changed after the manifest step.`);
    }
    entries.push({ path: file.path, bytes });
  }
  return { manifest, entries };
}

async function push(options: PublishOptions, deps: CliDeps): Promise<string> {
  const { manifest, entries } = await bundleEntries(options);
  const dir = await mkdtemp(join(tmpdir(), 'ratatoskr-site-bundle-'));
  try {
    await writeFile(join(dir, bundleFileName), writeTar(entries));
    const pushed = await deps.exec({
      command: 'oras',
      args: [
        'push',
        `${options.image}:sha-${options.commit}`,
        '--artifact-type',
        bundleMediaType,
        '--annotation',
        `org.opencontainers.image.source=https://github.com/${manifest.repository}`,
        '--annotation',
        `org.opencontainers.image.revision=${options.commit}`,
        '--format',
        'go-template={{.digest}}',
        `${bundleFileName}:${bundleLayerMediaType}`,
      ],
      cwd: dir,
    });
    const digest = pushed.stdout.trim();
    if (pushed.code !== 0 || !digestPattern.test(digest)) {
      throw new CliError(`oras push failed: ${pushed.stderr.trim() || digest}`);
    }
    return digest;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function publishBundle(options: PublishOptions, deps: CliDeps): Promise<number> {
  checked(options.commit, { name: 'full commit SHA', pattern: commitPattern });
  const ref = `${options.image}:sha-${options.commit}`;
  const found = await deps.exec({
    command: 'oras',
    args: ['manifest', 'fetch', '--descriptor', ref],
  });
  if (found.code !== 0 && !saysNotFound(found.stderr, ref)) {
    throw new CliError(`oras cannot tell whether ${ref} exists: ${found.stderr.trim()}`);
  }
  if (found.code === 0) {
    const digest = (JSON.parse(found.stdout) as { digest?: unknown }).digest;
    if (typeof digest !== 'string' || !digestPattern.test(digest)) {
      throw new CliError(`oras gave no sha256 digest for ${ref}: ${found.stdout.trim()}`);
    }
    deps.out(`${ref} already exists at ${digest}; nothing is published.`);
    await output(deps, { image: options.image, digest, attest: 'false' });
    return 0;
  }
  const digest = await push(options, deps);
  deps.out(`published ${ref} at ${digest}`);
  await output(deps, { image: options.image, digest, attest: 'true' });
  return 0;
}
