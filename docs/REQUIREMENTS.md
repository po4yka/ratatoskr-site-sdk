# Requirements

The requirements come from the workspace change `add-site-publications`, specs
`site-content-delivery` and `site-manifest`, and its design D2 and D10. This file lists the part
that this repository owns.

1. `@ratatoskr/site-sdk` exposes the types of `sites/release.v1`, `sites/page.v1` and
   `sites/site-manifest.v1` from the pinned contracts.
2. `@ratatoskr/site-sdk` exposes a typed client for every route of the Content Delivery API,
   generated from the published API description. A check fails when the committed generated code
   differs from a fresh generation.
3. The starter template builds with no code change and renders a release that the delivery API
   serves.
4. The template carries an example `ratatoskr-site.toml` that validates against
   `sites/site-manifest.v1`.
5. The template renders a page from its `ast`, and never inserts the `html` member.
6. `@ratatoskr/site-sdk` signs in the owner of a site with PKCE, and every bundle built from the
   template ships the reserved callback page `.ratatoskr/sign-in/index.html` (SITE-027).
7. `@ratatoskr/site-sdk` follows the site event stream and resumes it with `Last-Event-ID`
   (SITE-027).
8. `@ratatoskr/site-sdk` edits a note by uploading its content as a blob and posting the
   `BlobRef`, and maps `edit.completed` and `edit.conflicted` to typed outcomes (SITE-027).
