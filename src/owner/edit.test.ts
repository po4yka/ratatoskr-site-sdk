import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fakeFetch, type SentRequest } from '../../tests/fake-fetch.js';
import type { SiteEvent } from '../contracts/sites/site-event.v1.js';
import { createOwnerClient, editOutcome } from './edit.js';

// SITE-027 task 10.5 (workspace design D6, spec `site-owner-editing`): the content goes to Edge
// as a blob first, and the edit names only the stored blob.
const fixture = (name: string): SiteEvent =>
  JSON.parse(
    readFileSync(`contracts/fixtures/sites/site-event/valid/${name}.json`, 'utf8'),
  ) as SiteEvent;

const sourceRef = 'src_7Hq2kV9xR4mT1wZp';
const baseHash = '1b2c3d4e5f60710a1b2c3d4e5f60710a1b2c3d4e5f60710a1b2c3d4e5f60710a';
const contentHash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const markdown = '# Start here\n\nThe new text of the page.\n';
const uploaded = {
  content_blob: {
    owner_service: 'ratatoskr-notes',
    digest: { algorithm: 'sha256', hex: contentHash },
    media_type: 'text/markdown',
    length_bytes: 42,
  },
  content_hash: contentHash,
};
const accepted = { operation_id: '018f0000-0000-7000-8000-000000000d01', status: 'accepted' };

describe('the owner editing helpers', () => {
  it('edit_uploads_blob_then_posts_blob_ref', async () => {
    const edge = fakeFetch((request) =>
      request.url.endsWith('/blobs')
        ? Response.json(uploaded, { status: 201 })
        : Response.json(accepted, { status: 202 }),
    );
    const client = createOwnerClient({ baseUrl: '/_r', site: 'docs', fetch: edge.fetch });

    const answer = await client.edit({ sourceRef, baseHash, markdown, idempotencyKey: 'edit-1' });

    expect(edge.sent.map((request) => [request.method, request.url])).toEqual([
      ['POST', `/_r/v1/sites/docs/drafts/sources/${sourceRef}/blobs`],
      ['POST', '/_r/v1/sites/docs/edits'],
    ]);
    const [upload, edit] = edge.sent as [SentRequest, SentRequest];
    expect(upload.body).toBe(markdown);
    expect(upload.credentials).toBe('same-origin');
    expect(upload.headers).toEqual({
      'content-type': 'application/octet-stream',
      'x-ratatoskr-site-request': '1',
    });
    expect(edit.credentials).toBe('same-origin');
    expect(edit.headers).toEqual({
      'content-type': 'application/json',
      'x-ratatoskr-site-request': '1',
    });
    expect(JSON.parse(edit.body ?? 'null')).toEqual({
      source_ref: sourceRef,
      base_hash: baseHash,
      content_blob: uploaded.content_blob,
      content_hash: contentHash,
      idempotency_key: 'edit-1',
    });
    // The edit names the blob and never carries the content.
    expect(edit.body).not.toContain('The new text');
    expect(answer).toEqual(accepted);
  });

  it('conflict_event_maps_to_typed_conflict', () => {
    expect(editOutcome(fixture('edit-conflicted'))).toEqual({
      kind: 'conflicted',
      operation_id: '018f0000-0000-7000-8000-000000000d01',
      conflict_id: '018f0000-0000-7000-8000-000000000d02',
      source_ref: sourceRef,
    });
    expect(editOutcome(fixture('edit-completed'))).toEqual({
      kind: 'completed',
      operation_id: '018f0000-0000-7000-8000-000000000d01',
      source_ref: sourceRef,
      revision: baseHash,
    });
    expect(editOutcome(fixture('release-published'))).toBeNull();
  });
});
