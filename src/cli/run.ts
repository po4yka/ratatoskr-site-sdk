import { parseArgs } from 'node:util';

import { type ManifestOptions, writeBundleManifest } from './bundle-manifest.js';
import { CliError } from './bundle-paths.js';
import { publishBundle, type PublishOptions } from './bundle-publish.js';
import type { CliDeps } from './deps.js';

// `ratatoskr-site`: the steps of the reusable bundle workflow, and the commands of the owner.

export const usage = `Usage:
  ratatoskr-site bundle manifest --dir <dir> --site <site> --repository <owner/name>
      --commit <sha> [--hashed-globs <glob,...>] [--entry-document <path>] [--no-entry-fallback]
  ratatoskr-site bundle publish --dir <dir> --image <ghcr.io/owner/name> --commit <sha>`;

type Values = Record<string, string | boolean | undefined>;

function required(values: Values, name: string): string {
  const value = values[name];
  if (typeof value !== 'string' || value === '') throw new CliError(`--${name} is required.`);
  return value;
}

function options(args: string[], names: { strings: string[]; flags?: string[] }): Values {
  const config: Record<string, { type: 'string' | 'boolean' }> = {};
  for (const name of names.strings) config[name] = { type: 'string' };
  for (const name of names.flags ?? []) config[name] = { type: 'boolean' };
  return parseArgs({ args, options: config, strict: true, allowPositionals: false }).values;
}

function manifestOptions(args: string[]): ManifestOptions {
  const values = options(args, {
    strings: ['dir', 'site', 'repository', 'commit', 'hashed-globs', 'entry-document'],
    flags: ['no-entry-fallback'],
  });
  const globs = typeof values['hashed-globs'] === 'string' ? values['hashed-globs'] : 'assets/**';
  return {
    dir: required(values, 'dir'),
    site: required(values, 'site'),
    repository: required(values, 'repository'),
    commit: required(values, 'commit'),
    hashedGlobs: globs
      .split(/[,\n]/)
      .map((glob) => glob.trim())
      .filter((glob) => glob !== ''),
    entryDocument:
      typeof values['entry-document'] === 'string' ? values['entry-document'] : 'index.html',
    entryFallback: values['no-entry-fallback'] !== true,
  };
}

function publishOptions(args: string[]): PublishOptions {
  const values = options(args, { strings: ['dir', 'image', 'commit'] });
  return {
    dir: required(values, 'dir'),
    image: required(values, 'image'),
    commit: required(values, 'commit'),
  };
}

const commands: Record<string, (args: string[], deps: CliDeps) => Promise<number>> = {
  'bundle manifest': (args, deps) => writeBundleManifest(manifestOptions(args), deps),
  'bundle publish': (args, deps) => publishBundle(publishOptions(args), deps),
};

// The exit status: 0 on success, 1 when the command fails, and 2 for an unknown command.
export async function run(argv: string[], deps: CliDeps): Promise<number> {
  const name = argv[0] === 'bundle' ? argv.slice(0, 2).join(' ') : (argv[0] ?? '');
  const command = commands[name];
  if (command === undefined) {
    deps.err(usage);
    return 2;
  }
  try {
    return await command(argv.slice(name.split(' ').length), deps);
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
