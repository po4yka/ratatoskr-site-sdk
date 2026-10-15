import type { CliDeps } from './deps.js';

// RED stub of SITE-026 task 9.1: no command does anything. Task 9.3 replaces it.
export function run(argv: string[], deps: CliDeps): Promise<number> {
  void argv;
  void deps;
  return Promise.resolve(0);
}
