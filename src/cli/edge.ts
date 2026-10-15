import type { components } from '../generated/platform.js';
import { siteApiError } from '../owner/request.js';
import { CliError, sitePattern } from './bundle-paths.js';
import type { CliDeps } from './deps.js';

// What `login` keeps in the credential store and `deploy` reads back: the Edge origin and the
// `site_deployer` device. The root secret opens a new device session on each deploy, so no refresh
// chain is kept.

export type PairDevice = components['schemas']['PairDevice'];
export type Paired = components['schemas']['Paired'];
export type OpenDeviceSession = components['schemas']['OpenDeviceSession'];
export type DeviceSessionOpened = components['schemas']['DeviceSessionOpened'];

export interface StoredDevice {
  api: string;
  device_id: string;
  device_secret: string;
}

export function checkedSite(site: string): string {
  if (!sitePattern.test(site)) throw new CliError(`${JSON.stringify(site)} is not a site id.`);
  return site;
}

// The origin of Edge: `https`, or `http` on a loopback host only.
export function edgeOrigin(api: string): string {
  const url = new URL(api);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new CliError(`--api must be an https address, not ${api}.`);
  }
  return url.origin;
}

// One request to Edge that answers JSON with one of `status`.
export async function edgeJson<T>(
  deps: CliDeps,
  request: { url: string; init: RequestInit; status: number[] },
): Promise<T> {
  const response = await deps.fetch(request.url, request.init);
  if (!request.status.includes(response.status)) throw await siteApiError(response);
  return (await response.json()) as T;
}

export async function storedDevice(site: string, deps: CliDeps): Promise<StoredDevice> {
  const secret = await deps.credentials.get(site);
  if (secret === null) {
    throw new CliError(`No device is paired for ${site}. Run ratatoskr-site login first.`);
  }
  return JSON.parse(secret) as StoredDevice;
}

export async function openDeviceSession(device: StoredDevice, deps: CliDeps): Promise<string> {
  const body: OpenDeviceSession = {
    device_id: device.device_id,
    device_secret: device.device_secret,
  };
  const opened = await edgeJson<DeviceSessionOpened>(deps, {
    url: `${device.api}/v1/sessions/device`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    status: [201],
  });
  return opened.credential;
}
