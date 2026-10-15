# Security Policy for the Ratatoskr Site SDK

Report a vulnerability privately to the repository owner. Do not publish a session credential, the
content of an unpublished note, or a log that contains one.

A security review is necessary for each change to the way the template puts content into a
document, to the routes that the package or the template reads, and to the dependencies that ship
in the package or in a site bundle.

Baseline:

- The template reads only the anonymous delivery routes under `/v1/sites/{site}/content/`. It sends
  no cookie and no `Authorization` header.
- The template renders a page from its `ast` with DOM nodes and text. It does not insert the `html`
  member of a page, and it does not use `innerHTML`, `outerHTML`, `insertAdjacentHTML` or
  `document.write` for content.
- A link, an image and an embed get their address from the page. The contract refuses a
  `javascript:` or `data:` address, and the sites service enforces the contract before it serves a
  page.
- The package has no runtime dependency, no remote code and no `eval`.
- The contract types and the fixtures are byte-exact copies from `ratatoskr-contracts`, checked
  against the digests in `contracts/contracts.lock.json`.
