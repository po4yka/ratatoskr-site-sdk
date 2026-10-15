## Why

SITE-025 lets the owner publish notes of a connected vault as independent sites (workspace change
`add-site-publications`, ADR-0011). A site is the owner's own repository with its own UI. It needs
the contract types of a release and a page, a client for the Content Delivery API, and a starting
point that already renders a release. The workspace change `add-site-publications` (group 7, design
D10, spec `site-content-delivery`) assigns that to this new repository.

## What Changes

- Create the repository with the fleet files, TypeScript strict mode, Vitest, ESLint, Prettier and
  `ci.yml`.
- Vendor the generated TypeScript of `sites/release.v1`, `sites/page.v1` and
  `sites/site-manifest.v1`, and the contract fixtures of a release and its pages, from
  `ratatoskr-contracts` at a pinned commit, with a lock of their digests and
  `npm run contracts:check`.
- Add the starter template: Vite and TypeScript, no UI framework, an example `ratatoskr-site.toml`.
  The home page lists the pages of the current release. A page view renders the page from its
  `ast` with DOM nodes and text.
- Write the README: how to start a site from the template, how to write the manifest, and which
  capabilities are public.
- Later, in this change: the client generated with `openapi-typescript` from the Content Delivery
  API description and its `generated-drift` check (workspace tasks 7.2 and 7.3). That description
  will be `openapi/content-delivery.json` in `ratatoskr-sites`, and it does not exist yet.

## Capabilities

### New Capabilities

- `site-sdk`: the package types, the generated client, and the starter template.

### Modified Capabilities

None.

## Impact

- New repository `ratatoskr-site-sdk` and the npm package `@ratatoskr/site-sdk` (not published yet).
- The template reads `GET /v1/sites/{site}/content/release` and
  `GET /v1/sites/{site}/content/pages/{slug}` under `/_r/` on the origin of the site, and shows
  assets from `GET /v1/sites/{site}/content/assets/{sha256}`.
- The workspace adds this repository to the fleet (workspace task 1.7, groups 9 and 10).
