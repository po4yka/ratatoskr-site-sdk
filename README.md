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
- Hosting a site on the Ratatoskr host comes with SITE-026 (`add-site-gateway-hosting`).

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

Only the first four are public. The other four need an owner session, which SITE-027 delivers, so
today they grant nothing. The template uses `pages.read` and `assets.read`.

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
