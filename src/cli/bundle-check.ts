import type { BundleManifest } from '../contracts/sites/bundle-manifest.v1.js';
import { bundlePathProblem, CliError, manifestName, sha256Hex } from './bundle-paths.js';
import { readTar } from './tar-read.js';

// The check of a pulled bundle on the machine that deploys it (workspace spec `site-bundles`, "The
// deploy command verifies before it uploads"): the manifest names the site, the commit and the
// repository of the command, every listed file is in the archive with its size and SHA-256, and
// the archive holds no other file.

export interface ExpectedBundle {
  site: string;
  commit: string;
  repository: string;
}

function checkHeader(manifest: BundleManifest, expected: ExpectedBundle): void {
  if (manifest.site_id !== expected.site) {
    throw new CliError(`The bundle is for the site ${manifest.site_id}, not ${expected.site}.`);
  }
  if (manifest.commit !== expected.commit) {
    throw new CliError(`The bundle names the commit ${manifest.commit}, not ${expected.commit}.`);
  }
  if (manifest.repository.toLowerCase() !== expected.repository.toLowerCase()) {
    throw new CliError(`The bundle names ${manifest.repository}, not ${expected.repository}.`);
  }
}

function entriesByPath(archive: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const entry of readTar(archive)) {
    if (files.has(entry.path)) throw new CliError(`The bundle holds ${entry.path} twice.`);
    files.set(entry.path, entry.bytes);
  }
  return files;
}

// Removes each listed file from `files` after its check, so what stays is not in the manifest.
function checkFiles(manifest: BundleManifest, files: Map<string, Uint8Array>): void {
  for (const file of manifest.files) {
    const bytes = files.get(file.path);
    const problem = bundlePathProblem(file.path);
    if (problem !== null) throw new CliError(`${file.path} ${problem}.`);
    if (bytes === undefined) {
      throw new CliError(`${file.path} is in the manifest, not in the bundle.`);
    }
    if (bytes.length !== file.size_bytes || sha256Hex(bytes) !== file.sha256) {
      throw new CliError(`${file.path} does not match its size and SHA-256 in the manifest.`);
    }
    files.delete(file.path);
  }
}

export function checkedBundle(archive: Uint8Array, expected: ExpectedBundle): BundleManifest {
  const files = entriesByPath(archive);
  const manifestBytes = files.get(manifestName);
  if (manifestBytes === undefined) throw new CliError(`The bundle has no ${manifestName}.`);
  files.delete(manifestName);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as BundleManifest;
  checkHeader(manifest, expected);
  checkFiles(manifest, files);
  const [extra] = files.keys();
  if (extra !== undefined) throw new CliError(`${extra} is in the bundle, not in the manifest.`);
  return manifest;
}
