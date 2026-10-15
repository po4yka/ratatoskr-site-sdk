import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DeployActivated } from '../contracts/sites/deploy-activated.v1.js';
import type { DeployStored } from '../contracts/sites/deploy-stored.v1.js';
import { checkedBundle, type ExpectedBundle } from './bundle-check.js';
import {
  bundleFileName,
  checked,
  CliError,
  commitPattern,
  repositoryPattern,
} from './bundle-paths.js';
import type { CliDeps } from './deps.js';
import { checkedSite, edgeJson, openDeviceSession, storedDevice } from './edge.js';

// `ratatoskr-site deploy --site <site> --commit <sha> [--repository <owner/name>] [--no-activate]`
// (workspace change `add-site-gateway-hosting`, design D3). On the machine where it runs, it
// resolves `sha-<commit>` to a digest, verifies the attestation of that digest against the site
// repository, the commit and the reusable bundle workflow, pulls that digest and checks every file
// against the manifest. Only then does it open a device session, upload the bundle and activate it.

export const signerWorkflow =
  'po4yka/ratatoskr-site-sdk/.github/workflows/reusable-site-bundle.yml';

export interface DeployOptions {
  site: string;
  commit: string;
  // `owner/name`. The default is the GitHub remote `origin` of the working directory.
  repository: string | undefined;
  activate: boolean;
}

async function tool(deps: CliDeps, call: { command: string; args: string[]; failure: string }) {
  const result = await deps.exec({ command: call.command, args: call.args });
  if (result.code !== 0) throw new CliError(`${call.failure}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

// `https://github.com/owner/name(.git)`, `git@github.com:owner/name(.git)` or
// `ssh://git@github.com/owner/name(.git)`, and nothing else.
const githubRemote =
  /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/;

async function originRepository(deps: CliDeps): Promise<string> {
  const remote = await deps.exec({
    command: 'git',
    args: ['remote', 'get-url', 'origin'],
    cwd: deps.cwd,
  });
  const match = githubRemote.exec(remote.stdout.trim());
  if (remote.code !== 0 || match?.[1] === undefined) {
    throw new CliError('The remote origin is not a GitHub repository. Name it with --repository.');
  }
  return match[1];
}

// The bytes of the bundle, after every check.
async function verifiedArchive(
  expected: ExpectedBundle,
  deps: CliDeps,
): Promise<Uint8Array<ArrayBuffer>> {
  const image = `ghcr.io/${expected.repository.toLowerCase()}`;
  const tag = `${image}:sha-${expected.commit}`;
  const digest = await tool(deps, {
    command: 'oras',
    args: ['resolve', tag],
    failure: `oras cannot resolve ${tag}`,
  });
  if (!/^sha256:[0-9a-f]{64}$/.test(digest))
    throw new CliError(`oras resolved ${tag} to ${digest}.`);
  await tool(deps, {
    command: 'gh',
    args: [
      'attestation',
      'verify',
      `oci://${image}@${digest}`,
      '--repo',
      expected.repository,
      '--source-digest',
      expected.commit,
      '--signer-workflow',
      signerWorkflow,
      '--deny-self-hosted-runners',
    ],
    failure: `The attestation of ${image}@${digest} is not valid`,
  });
  const dir = await mkdtemp(join(tmpdir(), 'ratatoskr-site-deploy-'));
  try {
    await tool(deps, {
      command: 'oras',
      args: ['pull', `${image}@${digest}`, '-o', dir],
      failure: `oras cannot pull ${image}@${digest}`,
    });
    const archive = new Uint8Array(await readFile(join(dir, bundleFileName)));
    checkedBundle(archive, expected);
    return archive;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function deploy(options: DeployOptions, deps: CliDeps): Promise<number> {
  const site = checkedSite(options.site);
  const commit = checked(options.commit, { name: 'full commit SHA', pattern: commitPattern });
  const repository = checked(options.repository ?? (await originRepository(deps)), {
    name: 'repository (owner/name)',
    pattern: repositoryPattern,
  });
  const device = await storedDevice(site, deps);
  const archive = await verifiedArchive({ site, commit, repository }, deps);
  const authorization = `Bearer ${await openDeviceSession(device, deps)}`;
  const deploys = `${device.api}/v1/sites/${site}/deploys`;
  const stored = await edgeJson<DeployStored>(deps, {
    url: deploys,
    init: {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/x-tar' },
      body: archive,
    },
    status: [200, 201],
  });
  deps.out(
    `${site}: ${stored.created ? 'stored' : 'already had'} ${commit}, ${stored.file_count} files.`,
  );
  if (!options.activate) return 0;
  const activated = await edgeJson<DeployActivated>(deps, {
    url: `${deploys}/${commit}/activate`,
    init: { method: 'POST', headers: { Authorization: authorization } },
    status: [200, 201],
  });
  deps.out(
    `${site}: serves ${activated.current_commit} (before: ${activated.previous_commit ?? 'none'}).`,
  );
  return 0;
}
