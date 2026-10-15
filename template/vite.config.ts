import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parse } from 'smol-toml';
import { defineConfig } from 'vite';

import type { SiteManifest } from '../src/index.js';

// The site id has one source: `ratatoskr-site.toml`, the manifest that the owner submits. The
// grammar is the `SiteId` of the contract `sites/site-manifest.v1`.
const manifestPath = fileURLToPath(new URL('ratatoskr-site.toml', import.meta.url));
const manifest = parse(readFileSync(manifestPath, 'utf8')) as Partial<SiteManifest>;
const siteId = manifest.site_id;
if (typeof siteId !== 'string' || !/^[a-z0-9-]{3,40}$/.test(siteId)) {
  throw new Error(
    `ratatoskr-site.toml: site_id must be 3 to 40 lower-case ASCII letters, digits and "-"`,
  );
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Inside this repository the template takes the package from `src/`, as `tsconfig.json` does. A
  // site outside it installs `@ratatoskr/site-sdk` and needs no alias.
  resolve: {
    alias: { '@ratatoskr/site-sdk': fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
  },
  define: { __RATATOSKR_SITE_ID__: JSON.stringify(siteId) },
});
