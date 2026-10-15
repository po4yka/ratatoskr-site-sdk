## Context

The source of this design is the workspace change `add-site-owner-editing-and-live`: design D1
(sign-in with PKCE), D4 (CSRF defence), D5 (the event stream) and D6 (editing through the notes
write path), and the specs `site-owner-session`, `site-live-events` and `site-owner-editing`.
Platform exposes:

- the security scheme `siteSessionCookie`: the cookie `__Host-ratatoskr-site`, which the browser
  holds and the page cannot read;
- the check of every state change on a site route: the header `X-Ratatoskr-Site-Request: 1` and
  an `Origin` equal to the approved hostname;
- SSE event ids of the form `<epoch>.<sequence>`, and a `resync` event when an id is unknown or
  too old;
- `edit.completed` with `operation_id`, `source_ref` and `revision`, and `edit.conflicted` with
  `operation_id`, `conflict_id` and `source_ref` (contract `sites/site-event.v1`);
- the blob upload: one body of at most 16 MiB, which Edge stores in `ratatoskr-notes` as one chunk
  with the media type `text/markdown`.

## Goals / Non-Goals

**Goals:**

- The PKCE verifier never leaves the site origin, and the sign-in code leaves the address bar
  before the code is posted.
- A short break of the event stream loses no event, and a long break makes the site fetch again.
- An edit always uploads the content first and then posts only the `BlobRef`.

**Non-Goals:**

- A sign-in button or an editor in the starter template. The template uses the public
  capabilities only; a site adds owner mode itself.
- The release request, the library and the knowledge routes. The workspace group 10 does not ask
  for them.

## Decisions

### 1. The types come from the Platform description and the contracts

`openapi/platform.json` is a byte-exact copy of `openapi/openapi.json` of `ratatoskr-platform`.
`openapi/platform.lock.json` records its SHA-256, the Platform commit and the generator, as
`openapi/content-delivery.lock.json` does for the delivery API. `scripts/generate-client.ts`
generates both descriptions, and `npm run generated:check` compares both outputs. The request and
answer bodies (`SiteDraft`, `SiteBlobUploaded`, `SiteEditRequest`, `SiteConflict`,
`SiteSessionOpened`) come from it. The event types come from the vendored `sites/site-event.v1`.
The description holds no route for the event stream, so the SSE framing is written by hand and
the data of each frame has the contract type.

### 2. The SDK does not navigate

`beginSignIn` stores the verifier and gives back the address of the consent page of
`ratatoskr-web`. `completeSignIn` gives back the answer, with a `return_path` that is a path on
the site. The caller moves the page. A test can then run both functions in a happy-dom window with
no navigation.

### 3. The events client uses `fetch`, not `EventSource`

`EventSource` cannot set a header, and the caller cannot choose when it reconnects. The client
reads `text/event-stream` with `fetch`, sends `Last-Event-ID` after a break, and waits through an
injected function before it reconnects, so a test needs no wall clock. A 5xx answer or a network
error starts a reconnect; another answer stops the client and reports a `SiteApiError`.

### 4. Every request to an owner route is same-origin

Owner requests send `credentials: 'same-origin'`, so the browser adds the owner cookie. A state
change adds `X-Ratatoskr-Site-Request: 1`; the browser adds `Origin` to every `POST`. The public
delivery client keeps `credentials: 'omit'`.

### 5. The upload body is `application/octet-stream`

The Platform description declares the upload body as `application/octet-stream`. Edge stores the
bytes with the media type `text/markdown`. The SDK refuses content above 16 MiB before the request,
because Edge answers 413 to it.

## Risks / Trade-offs

- [The Platform commit is not on `main` yet] → The lock names it. Moving the pin regenerates the
  types, and `npm run generated:check` shows any change.
- [The site code runs with the owner cookie] → The cookie only works on the routes of this site,
  and Platform checks the header and the `Origin` of each state change.
