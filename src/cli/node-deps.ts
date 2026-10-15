import { spawn } from 'node:child_process';

import { CliError } from './bundle-paths.js';
import type { CliDeps, ExecCall, ExecResult } from './deps.js';

// The real environment of `ratatoskr-site`: processes, `fetch`, the process environment and the
// standard streams.

function exec(call: ExecCall): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(call.command, call.args, { cwd: call.cwd, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.on('error', (error) => reject(new CliError(`${call.command}: ${error.message}`)));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(call.input ?? '');
  });
}

export function nodeDeps(): CliDeps {
  return {
    exec,
    fetch: globalThis.fetch.bind(globalThis),
    credentials: {
      get: () => Promise.reject(new CliError('This version keeps no credential.')),
      set: () => Promise.reject(new CliError('This version keeps no credential.')),
    },
    env: process.env,
    cwd: process.cwd(),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  };
}
