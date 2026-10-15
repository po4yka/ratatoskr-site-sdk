## ADDED Requirements

### Requirement: The sign-in verifier stays in the session storage of the site

`beginSignIn` SHALL keep the PKCE verifier only in `sessionStorage` of the site origin, and SHALL
give back the address of the consent page with the S256 challenge of the verifier and the return
path. The address SHALL NOT hold the verifier.

#### Scenario: The owner starts a sign-in

- **WHEN** a site calls `beginSignIn` for site `docs`
- **THEN** `sessionStorage` holds one verifier, `localStorage` and the cookies are empty, and the
  address is `/sites/docs/sign-in` on the web client with the challenge and the return path,
  verified by `src/owner/sign-in.test.ts` `stores_verifier_only_in_session_storage`

### Requirement: The callback page removes the code before it posts it

`completeSignIn` SHALL remove the `code` from the address with `history.replaceState` before it
posts the code and the verifier to `/v1/sites/{site}/sessions`. The post SHALL carry
`X-Ratatoskr-Site-Request: 1` and SHALL be same-origin.

#### Scenario: The callback page redeems a code

- **WHEN** the callback page opens with `?code=K1` and a stored verifier
- **THEN** `location.search` holds no `code` when the post is sent, and the post carries the code,
  the verifier and the header, verified by `src/owner/sign-in.test.ts`
  `callback_removes_code_from_history_before_post` and `callback_sends_site_request_header`

### Requirement: The template ships the reserved sign-in page

A build of the starter template SHALL contain `.ratatoskr/sign-in/index.html`, the callback page
of the sign-in.

#### Scenario: The template is built

- **WHEN** the template is built with Vite
- **THEN** the output holds `.ratatoskr/sign-in/index.html`, verified by
  `template/template.test.ts` `template_ships_reserved_sign_in_page`

### Requirement: The event client resumes from the last event id

`openSiteEvents` SHALL send `Last-Event-ID` with the id of the last event that it received when it
reconnects, and SHALL call the refetch callback when the stream sends `resync`.

#### Scenario: The stream breaks and reconnects

- **WHEN** the stream sends the event `e1.7` and closes
- **THEN** the next request carries `Last-Event-ID: e1.7`, verified by `src/live/events.test.ts`
  `reconnect_sends_last_event_id`

#### Scenario: The stream asks for a refetch

- **WHEN** the stream sends `resync`
- **THEN** the refetch callback is called once, verified by `src/live/events.test.ts`
  `resync_triggers_refetch_callback`

### Requirement: An edit uploads the content before it posts the BlobRef

The owner client SHALL upload the new content to `/v1/sites/{site}/drafts/sources/{source_ref}/blobs`
and then post `/v1/sites/{site}/edits` with the `BlobRef` and the content hash of the upload
answer, never with the content.

#### Scenario: The owner saves an edit

- **WHEN** the owner client saves new content for a `source_ref`
- **THEN** two requests are sent in that order, and the edit body holds the `BlobRef` and no
  content, verified by `src/owner/edit.test.ts` `edit_uploads_blob_then_posts_blob_ref`

#### Scenario: An edit conflicts

- **WHEN** the event `edit.conflicted` of the contract fixture is mapped
- **THEN** the result is a typed conflict with the operation id, the conflict id and the
  `source_ref`, verified by `src/owner/edit.test.ts` `conflict_event_maps_to_typed_conflict`
