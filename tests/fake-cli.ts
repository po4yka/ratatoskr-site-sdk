import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { CliDeps, ExecCall, ExecResult } from '../src/cli/deps.js';

// The environment of `ratatoskr-site` for a test: every process call is recorded and answered by
// a handler (the fake `oras` and the fake `gh`), the credential store is a map, and the output is
// kept in two lists.
export interface FakeCli {
  deps: CliDeps;
  calls: ExecCall[];
  out: string[];
  err: string[];
  secrets: Map<string, string>;
}

export interface FakeCliOptions {
  exec?: (call: ExecCall) => ExecResult | Promise<ExecResult>;
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  cwd?: string;
}

export const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '' });
export const failed = (stderr: string): ExecResult => ({ code: 1, stdout: '', stderr });

export function fakeCli(options: FakeCliOptions = {}): FakeCli {
  const calls: ExecCall[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const secrets = new Map<string, string>();
  const handler = options.exec ?? (() => failed('no such command in this test'));
  const deps: CliDeps = {
    exec: async (call) => {
      calls.push(call);
      return handler(call);
    },
    fetch: options.fetch ?? (() => Promise.reject(new Error('no request is expected'))),
    credentials: {
      get: (account) => Promise.resolve(secrets.get(account) ?? null),
      set: (entry) => {
        secrets.set(entry.account, entry.secret);
        return Promise.resolve();
      },
    },
    env: options.env ?? {},
    cwd: options.cwd ?? process.cwd(),
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  };
  return { deps, calls, out, err, secrets };
}

export const commit = '3f6c2a9e8b1d4c7f0a5e2b9d6c3f8a1e4b7d0c2f';

// The build output of a site: the entry document, two content-hashed assets, the reserved SDK
// page, a file whose name holds `assets` outside `assets/`, and an icon.
export const buildFiles: Record<string, string> = {
  'index.html': '<!doctype html><title>Docs</title><script src="/assets/index-4f2a9c.js"></script>',
  'assets/index-4f2a9c.js': 'console.log("docs");',
  'assets/fonts/inter-1b2c.woff2': 'wOF2 font bytes',
  '.ratatoskr/sign-in/index.html': '<!doctype html><title>Sign in</title>',
  'notes/assets.html': '<!doctype html><title>Notes</title>',
  'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
};

export async function buildOutput(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ratatoskr-site-build-'));
  for (const [path, text] of Object.entries(buildFiles)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  return dir;
}
