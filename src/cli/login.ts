import type { CliDeps } from './deps.js';
import { checkedSite, edgeJson, edgeOrigin, type PairDevice, type Paired } from './edge.js';

// `ratatoskr-site login --pairing-code <code> --site <site> --api <url>` (workspace change
// `add-site-gateway-hosting`, design D3). The owner makes the pairing code in the web client, with
// the expected kind `site_deployer` and one site. The command pairs this machine as that device and
// keeps the device secret in the credential store of the system. It writes no file.

export interface LoginOptions {
  pairingCode: string;
  site: string;
  api: string;
}

export async function login(options: LoginOptions, deps: CliDeps): Promise<number> {
  const site = checkedSite(options.site);
  const api = edgeOrigin(options.api);
  const body: PairDevice = {
    code: options.pairingCode,
    kind: 'site_deployer',
    display_name: `ratatoskr-site deploy ${site}`,
  };
  const paired = await edgeJson<Paired>(deps, {
    url: `${api}/v1/devices/pair`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    status: [201],
  });
  await deps.credentials.set({
    account: site,
    secret: JSON.stringify({
      api,
      device_id: paired.device_id,
      device_secret: paired.device_secret,
    }),
  });
  deps.out(`Paired the device ${paired.device_id} to deploy ${site}.`);
  deps.out('Its secret is in the credential store of this system, not in a file.');
  return 0;
}
