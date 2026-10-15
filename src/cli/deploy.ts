import type { CliDeps } from './deps.js';

// RED stub of SITE-026 task 9.4: `ratatoskr-site deploy` does nothing. Task 9.5 replaces it.
export function deploy(args: string[], deps: CliDeps): Promise<number> {
  void args;
  void deps;
  return Promise.resolve(0);
}
