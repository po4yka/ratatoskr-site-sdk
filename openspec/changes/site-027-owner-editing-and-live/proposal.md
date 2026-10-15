## Why

SITE-027 lets the owner of a site sign in on the site, follow live events and edit the source notes
of the site's publications from the site (workspace change `add-site-owner-editing-and-live`,
design D1, D4, D5 and D6). Platform delivers the owner session, the event stream and the edit
routes. The workspace change (group 10) gives this repository the browser side: the sign-in
callback, the SSE client with resume, and the editing helpers with their conflict types.

## What Changes

- Vendor the Platform API description (`openapi/openapi.json` of `ratatoskr-platform`) as
  `openapi/platform.json` with a digest lock, and generate its types into
  `src/generated/platform.ts`. Vendor the generated TypeScript of `sites/site-event.v1` and its
  valid fixtures from `ratatoskr-contracts`.
- Add `src/owner/sign-in.ts`: start a sign-in with a PKCE S256 challenge, and complete it on the
  reserved callback page.
- Add the reserved page `.ratatoskr/sign-in/index.html` to the starter template.
- Add `src/live/events.ts`: an SSE client for `GET /v1/sites/{site}/events` that resumes with
  `Last-Event-ID` and calls a refetch callback on `resync`.
- Add `src/owner/edit.ts`: read a draft, upload new content as a blob, post the edit with the
  `BlobRef`, read a conflict, and map `edit.completed` and `edit.conflicted` to typed outcomes.
- Document owner mode and the reserved `/.ratatoskr/` path in `README.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-sdk`: owner sign-in, the live event client and the editing helpers.

## Impact

- The package exports `beginSignIn`, `completeSignIn`, `openSiteEvents`, `createOwnerClient`,
  `editOutcome` and `SiteApiError`, and the types of the owner routes and of `sites/site-event.v1`.
- The template ships `.ratatoskr/sign-in/index.html`. It posts to
  `/_r/v1/sites/{site}/sessions`, which is the only route outside `content/*` that the template
  reads.
- `openapi/platform.json` comes from a Platform commit that is not on `main` of
  `ratatoskr-platform` yet. The lock records that commit, and a later pin can change the file.
