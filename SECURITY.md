# Security Policy for the Ratatoskr Site SDK

Report a vulnerability privately to the repository owner. Do not publish a session credential, the
content of an unpublished note, or a log that contains one.

A security review is necessary for each change to the way the template puts content into a
document, to the routes that the package or the template reads, and to the dependencies that ship
in the package or in a site bundle.

Baseline:

- The template reads only the anonymous delivery routes under `/v1/sites/{site}/content/`. It sends
  no cookie and no `Authorization` header. The one exception is the reserved sign-in page
  `.ratatoskr/sign-in/`, which posts the sign-in code to `/v1/sites/{site}/sessions`.
- The owner mode of the package keeps the PKCE verifier in `sessionStorage` only, removes the
  sign-in code from the address before it posts it, never reads the owner cookie, and sends
  `X-Ratatoskr-Site-Request: 1` with every state change. An edit sends the content as a blob first,
  and the edit names only the blob.
- The template renders a page from its `ast` with DOM nodes and text. It does not insert the `html`
  member of a page, and it does not use `innerHTML`, `outerHTML`, `insertAdjacentHTML` or
  `document.write` for content.
- A link, an image and an embed get their address from the page. The contract refuses a
  `javascript:` or `data:` address, and the sites service enforces the contract before it serves a
  page. The template checks again: it sets `href` from a link only for `https`, `http` and
  `mailto`, and `src` from an image only for `https` and `http`. Another address renders as text.
- The template reads a page only for a route slug of the contract grammar. A `.`, `..` or empty
  segment shows the not-found view and sends no request, so URL normalisation cannot turn a route
  into another delivery route.
- The package has no runtime dependency, no remote code and no `eval`.
- The contract types and the fixtures are byte-exact copies from `ratatoskr-contracts`, checked
  against the digests in `contracts/contracts.lock.json`.
