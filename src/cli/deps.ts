// What the command `ratatoskr-site` uses from its environment. Each part is injected, so a test
// runs a command with a fake `oras`, a fake `gh`, a fake credential store and a stub Edge, and
// starts no process.

export interface ExecCall {
  command: string;
  args: string[];
  cwd?: string;
  // Text for the standard input of the process, so that a secret is never an argument.
  input?: string;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CredentialStore {
  get(account: string): Promise<string | null>;
  set(entry: { account: string; secret: string }): Promise<void>;
}

export interface CliDeps {
  exec(call: ExecCall): Promise<ExecResult>;
  fetch: typeof fetch;
  credentials: CredentialStore;
  env: Record<string, string | undefined>;
  // The working directory: the site repository when the owner runs the command.
  cwd: string;
  // The whole standard input of the command.
  stdin(): Promise<string>;
  out(line: string): void;
  err(line: string): void;
}
