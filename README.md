# Ratatoskr Site SDK

`@ratatoskr/site-sdk` and a starter template for a site that shows published notes of a Ratatoskr
vault. A site is your own repository with your own UI. It reads the current release of its
publications at run time through the anonymous Content Delivery API (workspace change
`add-site-publications`, ADR-0011).

- Development: `DEVELOPMENT.md`
- Architecture: `docs/ARCHITECTURE.md`
- Security: `SECURITY.md`
- License: `LICENSE`

## Status

- The package exports the contract types of a release, a page and a site manifest, and
  `createContentClient`, a typed client for the four delivery routes: the release, a page, an
  asset and the search, each with `GET` and `HEAD`. Its types are generated from the Content
  Delivery API description of `ratatoskr-sites`. It sends no credential, it gives back the `ETag`
  of each answer for a later `ifNoneMatch`, and it refuses a search `q` outside 1 to 256 Unicode
  scalar values, a `limit` outside 1 to 50 and a negative `offset` before the request. The template
  reads the release and its pages through it.
- The package is not on npm yet, and `package.json` is `private`. Until it is published, the
  template builds only inside this repository, where it takes the types from `src/`.
- The package also gives a site the owner mode of SITE-027 (`add-site-owner-editing-and-live`): the
  owner sign-in, the live event stream and the editing helpers. See "Owner mode" below. Their
  types come from the Platform API description and from `sites/site-event.v1`.
- The package also gives a site its hosting on the Ratatoskr host (SITE-026,
  `add-site-gateway-hosting`): the reusable workflow `reusable-site-bundle.yml`, which publishes an
  attested bundle per commit, and the command `ratatoskr-site` with `login` and `deploy`. See
  "Publish and deploy a site" below.

## Start a site from the template

The template is Vite and TypeScript with no UI framework, so you can add the framework that you
want. It has a home page that lists the pages of the current release, and a page view at
`#/<slug>`.

1. Run `npm ci`.
2. Write your site in `template/ratatoskr-site.toml` (see the next section).
3. Run `npm run build`. The site is in `template/dist/`.

The template reads the delivery API on the origin of the site, under `/_r/`. The sites gateway
forwards `/_r/*` to Edge, so the site needs no API address and no CORS. It sends no credential.

The template renders a page from its `ast`, with DOM nodes and text. A page also carries `html`, the
same body as markup that the producer sanitised. The template does not use it. If you use it, you
put markup from the release into your document, so keep the rule of `SECURITY.md` in your site.

## Write the manifest

`ratatoskr-site.toml` is the manifest of a site (contract `sites/site-manifest.v1`). The build
reads `site_id` from it. You submit it to Ratatoskr, and you approve it in the web client.

```toml
site_id = "docs"
hostname = "docs.example.test"
publications = ["handbook"]
capabilities = ["pages.read", "assets.read"]
```

| Key | Value |
|---|---|
| `site_id` | 3 to 40 lower-case ASCII letters, digits and `-`. It is in every route of the site. |
| `hostname` | Exactly one DNS hostname, in lower case, with no scheme, port or final dot. |
| `publications` | One or more publication ids (same grammar as `site_id`), each once. |
| `capabilities` | The capabilities that the site requests, each once. See the next section. |

A manifest with another key, an unknown capability or a second hostname is refused with
`sites.manifest_invalid`, and the refusal names the key or the value.

The last valid manifest that you submit is the active manifest. A submission alone grants nothing.
The site serves only after you approve the active manifest in the web client; Platform holds the
approval. The **effective set** of a site is the capabilities and publications that both the
approved manifest and the active manifest name, with the approved hostname:

- an added capability, publication or hostname waits for a new approval;
- a removed one stops at once, with no approval;
- with no approval, or after you withdraw it, the set is empty.

## Capabilities

| Capability | Who can use it | What it allows |
|---|---|---|
| `pages.read` | Anyone | Read pages and the navigation of the current release |
| `assets.read` | Anyone | Read the assets of the current release |
| `search.publication` | Anyone | Full-text search over the current release only |
| `live.release` | Anyone | Receive `release.published` events over SSE (SITE-027) |
| `draft.read` | Owner session | Read unpublished changes of the site's publications |
| `notes.edit` | Owner session | Write the source notes of the site's publications |
| `library.read` | Owner session | Read the owner's knowledge library |
| `knowledge.search` | Owner session | Search across the owner's knowledge, not only the publication |

Only the first four are public. The other four need the owner session of the site (see "Owner
mode"). The template uses `pages.read` and `assets.read`.

A public capability that the site did not request, a site that has no approval and a site whose
approval you withdrew all answer `404 sites.site_not_found`, the same answer as a site that does
not exist.

## What a visitor can read

The Content Delivery API has four anonymous routes, `GET` and `HEAD` only:

| Route | Answer |
|---|---|
| `/v1/sites/{site}/content/release` | The current release (`sites/release.v1`) |
| `/v1/sites/{site}/content/pages/{slug}` | One page of the current release (`sites/page.v1`) |
| `/v1/sites/{site}/content/assets/{sha256}` | The bytes of one asset, with its media type |
| `/v1/sites/{site}/content/search` | Search over the current release |

A release holds only the notes that its publications select, after the privacy rules: no comment,
only the allowed frontmatter fields, and only the attachments that a published page uses.

Public answers can come from a shared cache: the release, page and search routes for up to 60
seconds, and the asset route for up to 3600 seconds. When you withdraw an approval, all public
content of the site stops within 3600 seconds, also in a shared cache.

## The reserved path `/.ratatoskr/`

`/.ratatoskr/` is reserved for the pages of the SDK. The template ships
`.ratatoskr/sign-in/index.html`, the callback page of the owner sign-in. Keep it in every bundle,
and put no other page under that path. The sites gateway serves `/.ratatoskr/*` with `no-store`
and with no entry fallback, so a bundle without the page makes the sign-in fail, not open the home
page.

## Owner mode

The owner of a site can sign in on the site, follow live events and edit the source notes of the
site's publications. The site must request the capabilities in its manifest, and you must approve
them: `live.release` for the event stream, `draft.read` to read sources and conflicts, and
`notes.edit` to edit.

1. **Sign in.** Call `beginSignIn({ site, webUrl, returnPath })` from a button, and go to the
   address that it gives back with `location.assign`. `webUrl` is the origin of your Ratatoskr web
   client. The function keeps a PKCE verifier in `sessionStorage` of the site only. In the web
   client you confirm the site, its hostname and its capabilities. The web client then opens
   `/.ratatoskr/sign-in/?code=...`, where `completeSignIn` removes the code from the address, posts
   it with the verifier, and gives back the path to return to. The answer sets the cookie
   `__Host-ratatoskr-site`, which the page cannot read. The session ends 12 hours after the
   sign-in, or 1 hour after its last use. You can revoke it in the session list of the web client.
2. **Follow events.** `openSiteEvents({ baseUrl: '/_r', site, onEvent, onResync })` reads
   `GET /v1/sites/{site}/events`. A visitor receives `release.published`; the owner also receives
   `draft.changed`, `edit.completed` and `edit.conflicted`. After a break the client reconnects
   with the id of the last event. When Edge no longer has the events after it, the client calls
   `onResync`, and the site must fetch its state again.
3. **Edit.** `createOwnerClient({ baseUrl: '/_r', site })` reads a source with `draftPage(slug)`
   or `draftSource(sourceRef)`; the answer holds the Markdown, the `source_ref` and the
   `revision`. `edit({ sourceRef, baseHash: revision, markdown })` uploads the content (at most
   16 MiB) and then posts the edit, which names only the stored blob. It gives back an operation
   id. The edit is done when the event stream sends `edit.completed` for that operation;
   `editOutcome(event)` turns the event into a typed result. On `edit.conflicted`, read the
   versions with `conflict(conflictId)`, and send a new edit whose `baseHash` is the current
   revision.

Every owner request is same-origin, and each state change carries `X-Ratatoskr-Site-Request: 1`.
Platform refuses a state change without that header or with an `Origin` other than your approved
hostname. A failed owner request throws a `SiteApiError` with the status and the code of the error,
for example 403 `edge.capability_not_granted` when the approval does not grant the capability.

An edit does not publish anything. A publication with the release mode `automatic` builds a new
release from the change; with `manual`, visitors see the previous release until you request one.

## Publish and deploy a site

A site is served on the Ratatoskr host from a static bundle: a tar archive of the build output with
`ratatoskr-bundle.json` (contract `sites/bundle-manifest.v1`) at its root. The manifest lists every
file with its size and SHA-256, and marks the content-hashed files, which the gateway caches for a
year.

Before approval, set `github_repository` in the site manifest to the real lower-case GitHub
`owner/name` and its numeric repository ID, as a string. The owner sees both values before approval.
A changed binding needs a new approval. Public GitHub repositories and public GHCR packages are
supported. To read the identity of your repository, use
`gh api repos/OWNER/REPO --jq '{repository: (.full_name | ascii_downcase), repository_id: (.id | tostring)}'`.
The public SDK fixture uses this binding:

```toml
[github_repository]
repository = "po4yka/ratatoskr-site-sdk"
repository_id = "1420131953"
```

1. **Publish a bundle per commit.** Call the reusable workflow from the site repository on a push
   to its default branch. Pin it to a commit of this repository, and keep `@ratatoskr/site-sdk` in
   the site's lockfile at the same version, because the workflow runs the steps of that package:

   ```yaml
   on:
     push:
       branches: [main]
   permissions: {}
   jobs:
     bundle:
       permissions:
         contents: read
         packages: write
         id-token: write
         attestations: write
       uses: po4yka/ratatoskr-site-sdk/.github/workflows/reusable-site-bundle.yml@89331e6aa0b845c3565c1d9785b0dd5038e2de81
       with:
         site-id: docs
   ```

   The workflow builds the site (`build-command`, default `npm run build`, into `output-dir`,
   default `dist`), writes the manifest (`ratatoskr-site bundle manifest`) and refuses a commit that
   is not `GITHUB_SHA`. It then pushes the tar to `ghcr.io/<owner>/<repository>:sha-<commit>` with
   `oras` (`ratatoskr-site bundle publish`) and attests the pushed digest. A tag that exists is
   never pushed again. `hashed-globs` (default `assets/**`) names the content-hashed files.
2. **Pair the deploy command once.** In the web client, make a pairing code with the expected kind
   `site_deployer` for the site. On the machine that deploys, run
   `npx ratatoskr-site login --pairing-code - --site docs --api https://<edge>` and type the code;
   `-` reads it from stdin, so it is not in the shell history. The command
   keeps the device secret in the credential store of the system (the macOS keychain, or the Secret
   Service through `secret-tool` on Linux), never in the site repository. You can revoke the device
   in the device list of the web client.
3. **Deploy a commit.** Run `npx ratatoskr-site deploy --site docs --commit <sha>` in the site
   repository. It needs `oras` 1.3.0 and `gh` 2.102.0. It verifies the artifact against the site repository,
   source commit and exact reusable workflow revision, then checks the archive files. It sends
   at most 1 MiB of JSON with the source commit, immutable artifact SHA-256 and untrusted Sigstore
   proof. The server independently verifies the proof and fetches the artifact from the approved
   repository. It activates the stored bundle unless `--no-activate` is set.

   The deploy command repeats artifact verification on each call. The host can activate an already
   verified stored commit through `POST /v1/sites/{site}/deploys/{commit}/activate` without a registry
   download. Current approval and policy still apply to that rollback.
   `--repository owner/name` names the repository when the remote `origin` is not on GitHub.

The server permits the workflow revision shown above. Move that pin and the server policy together
in a reviewed change. A failed proof, foreign repository ID, changed digest or unapproved binding
refuses deployment. A different digest for a stored commit is a conflict. Publish a new commit after
fixing the build or policy problem; the existing artifact and stored proof remain immutable.
