import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';

import type { BundleFile, BundleManifest } from '../contracts/sites/bundle-manifest.v1.js';
import {
  bundlePathProblem,
  byPath,
  checked,
  CliError,
  commitPattern,
  manifestName,
  repositoryPattern,
  sha256Hex,
  sitePattern,
} from './bundle-paths.js';
import type { CliDeps } from './deps.js';

// The manifest step of the reusable bundle workflow (workspace change `add-site-gateway-hosting`,
// design D4): `ratatoskr-bundle.json` at the root of the build output lists every file with its
// size, SHA-256 and `hashed` flag.

export interface ManifestOptions {
  dir: string;
  site: string;
  repository: string;
  commit: string;
  // A file is content-hashed when its path matches one of them.
  hashedGlobs: string[];
  entryDocument: string;
  entryFallback: boolean;
}

// Every file under `dir` but the manifest, by its bundle path. A symbolic link or another entry
// that is not a regular file stops the step, because a bundle holds regular files only.
async function listFiles(dir: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    const path = relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/');
    if (entry.isDirectory() || path === manifestName) continue;
    if (!entry.isFile()) throw new CliError(`${path} is not a regular file.`);
    const problem = bundlePathProblem(path);
    if (problem !== null) throw new CliError(`${path} ${problem}.`);
    paths.push(path);
  }
  return paths;
}

async function bundleFile(dir: string, entry: { path: string; globs: string[] }) {
  const bytes = await readFile(join(dir, entry.path));
  const file: BundleFile = {
    path: entry.path,
    size_bytes: bytes.length,
    sha256: sha256Hex(bytes),
    hashed: entry.globs.some((glob) => posix.matchesGlob(entry.path, glob)),
  };
  return file;
}

function checkOptions(options: ManifestOptions, deps: CliDeps): void {
  const built = deps.env.GITHUB_SHA;
  if (built !== undefined && built !== options.commit) {
    throw new CliError(
      `The manifest names the commit ${options.commit}, and GITHUB_SHA is ${built}. ` +
        'A bundle names only the commit that this run built.',
    );
  }
  checked(options.site, { name: 'site id', pattern: sitePattern });
  checked(options.repository, { name: 'repository (owner/name)', pattern: repositoryPattern });
  checked(options.commit, { name: 'full commit SHA', pattern: commitPattern });
}

export async function writeBundleManifest(options: ManifestOptions, deps: CliDeps) {
  checkOptions(options, deps);
  const paths = await listFiles(options.dir);
  const files: BundleFile[] = [];
  for (const path of paths) {
    files.push(await bundleFile(options.dir, { path, globs: options.hashedGlobs }));
  }
  files.sort(byPath);
  if (!paths.includes(options.entryDocument)) {
    throw new CliError(`The entry document ${options.entryDocument} is not in ${options.dir}.`);
  }
  const manifest: BundleManifest = {
    site_id: options.site,
    repository: options.repository,
    commit: options.commit,
    entry_document: options.entryDocument,
    entry_fallback: options.entryFallback,
    files,
  };
  await writeFile(join(options.dir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
  const hashed = files.filter((file) => file.hashed).length;
  deps.out(`${manifestName} lists ${files.length} files, ${hashed} of them content-hashed.`);
  return 0;
}
