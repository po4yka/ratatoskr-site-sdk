## Why

SITE-026 serves a site from a static bundle on the Ratatoskr host (workspace change
`add-site-gateway-hosting`, design D3 and D4, spec `site-bundles`). The site repository publishes
an attested bundle per commit, and the owner deploys it from the controller. The workspace change
(group 9) gives this repository the reusable bundle workflow and the deploy command.

## What Changes

- Vendor the generated TypeScript of `sites/bundle-manifest.v1`, `sites/deploy-stored.v1` and
  `sites/deploy-activated.v1` from `ratatoskr-contracts`.
- Add `.github/workflows/reusable-site-bundle.yml`: build, write the manifest, write the tar,
  push it with `oras` to `sha-<commit>` unless the tag exists, and attest it.
- Add the command `ratatoskr-site` with the steps of that workflow (`bundle manifest`,
  `bundle publish`), `login --pairing-code` and `deploy --site --commit [--no-activate]`.
- Document the workflow and the commands in `README.md` and `template/README.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-sdk`: the bundle workflow and the deploy command.

## Impact

- `package.json` gets the `bin` entry `ratatoskr-site`, which the package builds into
  `dist/cli/main.js`.
- A site repository calls the workflow and installs `@ratatoskr/site-sdk`, so the steps that the
  workflow runs come from the version that the site locks.
- The deploy command calls `POST /v1/devices/pair`, `POST /v1/sessions/device`,
  `POST /v1/sites/{site}/deploys` and `POST /v1/sites/{site}/deploys/{commit}/activate` of Edge.
