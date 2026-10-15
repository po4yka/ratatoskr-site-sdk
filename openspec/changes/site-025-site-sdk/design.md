## Context

The source of this design is the workspace change `add-site-publications`: design D2 (the page body
is an mdast-compatible `ast` plus sanitised `html`), design D10 (the SDK is generated, and the
template has no framework), and the specs `site-content-delivery` and `site-manifest`. ADR-0011
places a site bundle behind the sites gateway, which forwards `/_r/*` to Edge.

## Goals / Non-Goals

**Goals:**

- Give a site the contract types with no hand-written copy.
- A template that builds with no change and renders a release.
- Render a page without a path from page content to markup.

**Non-Goals:**

- The owner session, drafts, editing and the SSE stream (SITE-027).
- Hosting, bundle upload and deploys (SITE-026).
- Publishing the package to npm.

## Decisions

### 1. The contract types are vendored with a digest lock

`ratatoskr-contracts` generates TypeScript for each contract under `generated/typescript/`, but it
has no `package.json`, so npm cannot install it from a git URL, and a git dependency would fetch the
whole repository and run its scripts. The files are copied byte-exact into `src/contracts/sites/`,
and the fixtures into `contracts/fixtures/sites/`. `contracts/contracts.lock.json` names the
contracts commit and the SHA-256 of each file. `npm run contracts:check` fails on a changed byte
and on a file that the lock does not name. This is the pattern of the Edge types in
`ratatoskr-obsidian-plugin` (`openapi.lock.json` and `api:check`), without a regeneration step:
the generator of these files is the Rust tool `contractsc`, which runs in `ratatoskr-contracts`.

### 2. The template renders the `ast`, not the `html`

A page carries its body twice (design D2). The template builds DOM nodes from the `ast` and sets
text with `textContent`. It never inserts `html`. A wiki link becomes a link to the page view of
the slug, an asset embed becomes an image or a link to the asset route, and a page embed becomes a
link to the embedded page. A site that wants `html` must first state that the producer sanitised it.

### 3. The site id comes from the manifest at build time

`template/vite.config.ts` reads `ratatoskr-site.toml` and gives its `site_id` to the bundle. The
template has one source for the site id, and the example manifest names the site of the contract
fixture release, so the template test needs no change to the template.

### 4. The template reads the API on its own origin

The sites gateway forwards `/_r/*` to Edge (ADR-0011), so the template reads
`/_r/v1/sites/{site}/content/...` with `credentials: 'omit'`. It needs no address setting and no
CORS.

### 5. A template test runs the built bundle

The test builds the template with Vite into a temporary folder, serves that build and the contract
fixtures from one loopback HTTP server, and opens the site in a happy-dom browser. It runs the same
bundle that a site would deploy, and it needs no browser download.

## Risks / Trade-offs

- [The lock proves that the files did not change here, not that they equal the contracts commit] →
  The lock names the commit and the source path of each file, so a reviewer can compare them with
  `git show <commit>:<path> | shasum -a 256`.
- [Tasks 7.2 and 7.3 prove the generated types, not what the client sends] → Tasks 7.11 and 7.12
  test the client with a fake `fetch`, and the template reads the release and its pages through it.
- [happy-dom is not a real browser] → It runs the module bundle, `fetch` and the DOM that the
  template uses. A visual check is not a goal of the test.
