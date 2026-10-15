import { CliError } from './bundle-paths.js';
import type { CliDeps, CredentialStore } from './deps.js';

// The credential store of the operating system (workspace design D3): the macOS keychain through
// `security`, or the Secret Service through `secret-tool` on Linux. The secret goes to the process
// on its standard input, never as an argument, and no file is written.

const service = 'ratatoskr-site';

function keychain(exec: CliDeps['exec']): CredentialStore {
  return {
    async get(account) {
      const found = await exec({
        command: 'security',
        args: ['find-generic-password', '-s', service, '-a', account, '-w'],
      });
      return found.code === 0 ? Buffer.from(found.stdout.trim(), 'base64').toString('utf8') : null;
    },
    async set({ account, secret }) {
      // `security -i` reads its command from stdin. Base64 keeps the secret free of quotes.
      const encoded = Buffer.from(secret, 'utf8').toString('base64');
      const stored = await exec({
        command: 'security',
        args: ['-i'],
        input: `add-generic-password -U -s ${service} -a ${account} -w ${encoded}\n`,
      });
      if (stored.code !== 0)
        throw new CliError(`The keychain refused the secret: ${stored.stderr}`);
    },
  };
}

function secretService(exec: CliDeps['exec']): CredentialStore {
  const attributes = (account: string) => ['service', service, 'account', account];
  return {
    async get(account) {
      const found = await exec({
        command: 'secret-tool',
        args: ['lookup', ...attributes(account)],
      });
      return found.code === 0 && found.stdout !== '' ? found.stdout : null;
    },
    async set({ account, secret }) {
      const stored = await exec({
        command: 'secret-tool',
        args: ['store', `--label=Ratatoskr site deployer ${account}`, ...attributes(account)],
        input: secret,
      });
      if (stored.code !== 0) throw new CliError(`secret-tool refused the secret: ${stored.stderr}`);
    },
  };
}

export function systemCredentials(exec: CliDeps['exec'], platform: string): CredentialStore {
  if (platform === 'darwin') return keychain(exec);
  if (platform === 'linux') return secretService(exec);
  const unsupported = () =>
    Promise.reject(new CliError(`No credential store is known on ${platform}.`));
  return { get: unsupported, set: unsupported };
}
