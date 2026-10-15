# Threat Model

## Assets

- The trust of a visitor in the site: the site shows only published content, and runs only its own
  code.
- The owner's unpublished notes, which the site must never ask for.

## Threats and controls

| Threat | Control |
|---|---|
| A page carries markup that runs script in the site. | The template renders the `ast` with DOM nodes and text, and never inserts the `html` member. A template test fails when the page view contains the markup of `html`. |
| A link or an image carries a `javascript:` or `data:` address. | The contract refuses such an address, and `ratatoskr-sites` validates every page against the contract before it serves it. The template also allows only `https`, `http` and `mailto` for a link and `https` and `http` for an image, and renders another address as text. A template test serves the refused contract fixtures. |
| A crafted route such as `#/../release` makes the site read another delivery route. | The template reads a page only for a slug of the contract grammar, and shows the not-found view with no request for any other route. A template test covers `.`, `..` and empty segments. |
| The site reads data outside the release. | The template reads only the anonymous routes under `/v1/sites/{site}/content/`, and sends no credential. |
| A third-party package in a site bundle is compromised. | Exact versions, a committed lockfile, `npm audit` in the gate, and no runtime dependency in the package. |
| The sign-in code leaks from the address, the history or a referrer. | The code is useless without the PKCE verifier, which stays in `sessionStorage` of the site. The callback page removes the code from the address before it posts it, and sends no referrer. `src/owner/sign-in.test.ts` covers both. |
| Another site or a cross-site form uses the owner session. | The cookie is host-only and `SameSite=Strict`, and Platform accepts it only on the routes of its site. Every state change carries `X-Ratatoskr-Site-Request: 1`, and Platform checks it and the `Origin`. |
| The `site_deployer` device secret is stolen from the machine that deploys. | `ratatoskr-site login` keeps it only in the credential store of the system, never in a file or the site repository, and gives it to `security` or `secret-tool` on stdin. The store is not a boundary against a process of the same user: on macOS the item is readable through `security find-generic-password` by any local process that runs as that user, because the `security` tool made it. The device can only upload to and activate one site, and the owner revokes it in the device list of the web client. |
| A tampered or foreign bundle is deployed. | `ratatoskr-site deploy` verifies the attestation of the digest against the site repository, the commit, the reusable workflow and a GitHub-hosted runner, then checks every file of the archive against the manifest, before any request. The reader of the archive accepts only regular files on safe UTF-8 paths. |
| A vendored contract file is changed by hand. | `npm run contracts:check` compares every vendored file with its digest in `contracts/contracts.lock.json`. |

## Out of scope

- The checks of the owner session in Platform: its lifetime, its audience and the capability check
  (SITE-027, `ratatoskr-platform`).
- The sites gateway and the deploy receipt on the host (SITE-026, `ratatoskr-sites`).
