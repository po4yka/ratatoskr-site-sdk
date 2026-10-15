# Developing the Ratatoskr Site SDK

## Toolchain

TypeScript in strict mode, Vitest for the tests, ESLint for the lint, and Prettier for the format.
The starter template builds with Vite. Every dependency is pinned to an exact version, and
`package-lock.json` is committed.

## Commands

Install once per clone. The Node line is in `.nvmrc`:

```bash
npm ci
```

`.npmrc` pins the public registry and keeps `save-exact`.

The gate runs these commands:

```bash
npm run contracts:check
npm run generated:check
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
```

This list and `.github/workflows/ci.yml` are one list. A step in `ci.yml` and
`tests/gate-parity.test.ts` fail when they differ, so change both or neither. The gate also runs
`npm audit --omit=dev --audit-level=high`.

`npm run build` writes the package to `dist/` and the starter site to `template/dist/`.

## The contract types

`src/contracts/sites/` holds the generated TypeScript of `sites/release.v1`, `sites/page.v1` and
`sites/site-manifest.v1`, byte-exact from `generated/typescript/json-schema/sites/` of
`ratatoskr-contracts`. `contracts/fixtures/sites/` holds the contract fixtures that the tests
serve, byte-exact from `fixtures/sites/`. `contracts/contracts.lock.json` records the contracts
commit, and the source path and the SHA-256 of each file. To move the pin:

1. Copy each file from the new commit: `git -C <contracts> show <commit>:<source> > <path>`.
2. Write the commit and the new digests (`shasum -a 256 <path>`) into the lock.
3. Run `npm run contracts:check`, then the whole gate.

The generator of these files is `contractsc` in `ratatoskr-contracts`, so this repository does not
regenerate them. The lock proves that a file did not change here. To prove that it equals the
contracts commit, compare `git -C <contracts> show <commit>:<source> | shasum -a 256` with the lock.

## The generated client

`openapi/content-delivery.json` is the Content Delivery API description, byte-exact from
`ratatoskr-sites` (ADR-0012 of `ratatoskr-workspace`). `openapi/content-delivery.lock.json` records
its SHA-256, the `ratatoskr-sites` commit and the generator version. The description references
the contract schemas by raw URLs at one `ratatoskr-contracts` commit. `contracts/schemas/` holds
those schemas, in the contracts lock, so the generation reads no network.

`npm run client:generate` writes `src/generated/content-delivery.ts` with `openapi-typescript`.
It stops when the description and its lock disagree, when the installed generator is not the
locked version, and when the description references a contracts commit other than the one in
`contracts/contracts.lock.json`. `npm run generated:check` generates into a temporary folder and
fails on any difference from `src/generated/`. `src/client.ts` is the hand-written client on top
of the generated types. To move the pin:

1. Copy the file from the new commit:
   `git -C <sites> show <commit>:openapi/content-delivery.json > openapi/content-delivery.json`.
2. Write the commit and the new digest (`shasum -a 256 openapi/content-delivery.json`) into the
   lock.
3. If the description references a new contracts commit, move the contracts pin first.
4. Run `npm run client:generate`, then the whole gate.

`openapi-typescript` 7.13.0 declares the peer `typescript ^5.x`. The `overrides` entry in
`package.json` gives it the TypeScript of this tree, so a plain `npm ci` resolves.

## Code size limits

`eslint.config.js` carries the size limits: file length, function length, cyclomatic complexity,
and parameter count, all at severity `error`. The values are the fleet TypeScript standard from
`ratatoskr-workspace/docs/QUALITY_GATES.md`. Raising one is a measured change recorded there.

## Tests

The tests run in Node. A test reads an injected clock, never the wall clock.

## Publishing

`package.json` is `private` until the owner decides how `@ratatoskr/site-sdk` is published. No
workflow publishes it.

## What a clone needs before you plan a change

A change is planned with OpenSpec, which is a CLI a clone installs for itself. Use the version
`.github/workflows/openspec.yml` pins, so your terminal and the gate answer the same:

```bash
npm install --global @fission-ai/openspec@1.10.0
```

Cross-repository behaviour lives in a store, and registering one is per-machine state:

```bash
git clone git@github.com:po4yka/ratatoskr-workspace.git <path>
openspec store register <path> --id ratatoskr-workspace
```

Set the hooks path once per clone:

```bash
git config core.hooksPath .githooks
```
