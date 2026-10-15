# Threat Model

## Assets

- The trust of a visitor in the site: the site shows only published content, and runs only its own
  code.
- The owner's unpublished notes, which the site must never ask for.

## Threats and controls

| Threat | Control |
|---|---|
| A page carries markup that runs script in the site. | The template renders the `ast` with DOM nodes and text, and never inserts the `html` member. A template test fails when the page view contains the markup of `html`. |
| A link or an image carries a `javascript:` or `data:` address. | The contract refuses such an address, and `ratatoskr-sites` validates every page against the contract before it serves it. |
| The site reads data outside the release. | The template reads only the anonymous routes under `/v1/sites/{site}/content/`, and sends no credential. |
| A third-party package in a site bundle is compromised. | Exact versions, a committed lockfile, `npm audit` in the gate, and no runtime dependency in the package. |
| A vendored contract file is changed by hand. | `npm run contracts:check` compares every vendored file with its digest in `contracts/contracts.lock.json`. |

## Out of scope

- The owner session and the owner-only capabilities (SITE-027).
- Hosting and the sites gateway (SITE-026).
