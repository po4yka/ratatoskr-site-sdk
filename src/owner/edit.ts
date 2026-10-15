import type {
  EditCompletedNotice,
  EditConflictedNotice,
  SiteEvent,
} from '../contracts/sites/site-event.v1.js';
import type { components } from '../generated/platform.js';
import { checkedSite, defaultFetch, siteApiError, stateChange } from './request.js';

// The editing helpers of the owner of a site (workspace change `add-site-owner-editing-and-live`,
// design D6, spec `site-owner-editing`). They need the owner cookie of the site, which
// `completeSignIn` gets, and the capabilities `draft.read` and `notes.edit`.
//
// An edit is two requests: the new content goes to Edge as a blob, which Edge stores in
// `ratatoskr-notes`, and then the edit names that blob. The write is pending until the vault has
// it: the event stream sends `edit.completed` or `edit.conflicted` with the operation id. A
// conflict is resolved with a new edit whose `base_hash` is the current revision.

export type SiteDraft = components['schemas']['SiteDraft'];
export type SiteBlobUploaded = components['schemas']['SiteBlobUploaded'];
export type SiteEditRequest = components['schemas']['SiteEditRequest'];
export type SiteEditAccepted = components['schemas']['SiteEditAccepted'];
export type SiteConflict = components['schemas']['SiteConflict'];
export type SiteConflictTexts = components['schemas']['SiteConflictTexts'];
export type SiteMergeProposal = components['schemas']['SiteMergeProposal'];
export type BlobRef = components['schemas']['BlobRef'];

// The largest content of one upload. Edge answers 413 above it.
export const maxContentBytes = 16 * 1024 * 1024;

export interface OwnerClientOptions {
  // The prefix in front of `/v1/sites/...`: `/_r` behind the sites gateway.
  baseUrl: string;
  site: string;
  fetch?: typeof fetch;
}

export interface EditRequest {
  // The note, from a draft that the owner read.
  sourceRef: string;
  // The `revision` of that draft: the lowercase hex SHA-256 of the bytes that the owner changed.
  baseHash: string;
  // The new content of the note.
  markdown: string;
  // 1 to 255 characters. A repeated edit with the same key answers the same operation. The
  // default is a new random key, so keep the key of an edit that you send again.
  idempotencyKey?: string;
}

export interface OwnerClient {
  // The source of a page of the current release. Capability `draft.read`.
  draftPage(slug: string): Promise<SiteDraft>;
  // The source of a note of the site's publications. Capability `draft.read`.
  draftSource(sourceRef: string): Promise<SiteDraft>;
  // Stores new content for a note. Capability `notes.edit`.
  upload(sourceRef: string, markdown: string): Promise<SiteBlobUploaded>;
  // Uploads the content, then posts the edit with the stored blob. Capability `notes.edit`.
  edit(request: EditRequest): Promise<SiteEditAccepted>;
  // The base, current and proposed versions of a conflict. Capability `draft.read`.
  conflict(conflictId: string): Promise<SiteConflict>;
}

// The end of an edit, from the event stream of the site.
export type EditOutcome =
  ({ kind: 'completed' } & EditCompletedNotice) | ({ kind: 'conflicted' } & EditConflictedNotice);

const slugPattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const sourceRefPattern = /^[A-Za-z0-9_-]{1,128}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hashPattern = /^[0-9a-f]{64}$/;
const keyPattern = /^.{1,255}$/su;

function checked(value: string, rule: { name: string; pattern: RegExp }): string {
  if (!rule.pattern.test(value) || value.length > 1024) {
    throw new RangeError(`${JSON.stringify(value)} is not a valid ${rule.name}.`);
  }
  return value;
}

const sourceRoute = (sourceRef: string): string =>
  `drafts/sources/${checked(sourceRef, { name: 'source_ref', pattern: sourceRefPattern })}`;

function contentOf(markdown: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(markdown);
  if (bytes.length === 0 || bytes.length > maxContentBytes) {
    throw new RangeError('The content of a note must be 1 byte to 16 MiB.');
  }
  return bytes;
}

function editBody(request: Required<EditRequest>, uploaded: SiteBlobUploaded): SiteEditRequest {
  return {
    source_ref: request.sourceRef,
    base_hash: request.baseHash,
    content_blob: uploaded.content_blob,
    content_hash: uploaded.content_hash,
    idempotency_key: request.idempotencyKey,
  };
}

export function createOwnerClient(options: OwnerClientOptions): OwnerClient {
  const base = `${options.baseUrl}/v1/sites/${checkedSite(options.site)}/`;
  const fetchImpl = options.fetch ?? defaultFetch();

  async function call<T>(route: string, request: { init: RequestInit; status: number }) {
    const response = await fetchImpl(base + route, request.init);
    if (response.status !== request.status) throw await siteApiError(response);
    return (await response.json()) as T;
  }
  const read = <T>(route: string) =>
    call<T>(route, { init: { credentials: 'same-origin', cache: 'no-store' }, status: 200 });
  const upload = (sourceRef: string, markdown: string) =>
    call<SiteBlobUploaded>(`${sourceRoute(sourceRef)}/blobs`, {
      init: stateChange(contentOf(markdown), 'application/octet-stream'),
      status: 201,
    });

  return {
    draftPage: (slug) =>
      read<SiteDraft>(`drafts/pages/${checked(slug, { name: 'slug', pattern: slugPattern })}`),
    draftSource: (sourceRef) => read<SiteDraft>(sourceRoute(sourceRef)),
    upload,
    edit: async (request) => {
      checked(request.baseHash, { name: 'base_hash', pattern: hashPattern });
      const idempotencyKey = checked(request.idempotencyKey ?? crypto.randomUUID(), {
        name: 'idempotency_key',
        pattern: keyPattern,
      });
      const uploaded = await upload(request.sourceRef, request.markdown);
      const body = JSON.stringify(editBody({ ...request, idempotencyKey }, uploaded));
      return call<SiteEditAccepted>('edits', {
        init: stateChange(body, 'application/json'),
        status: 202,
      });
    },
    conflict: (conflictId) =>
      read<SiteConflict>(
        `conflicts/${checked(conflictId, { name: 'conflict id', pattern: uuidPattern })}`,
      ),
  };
}

// `edit.completed` and `edit.conflicted` as typed outcomes; any other event is `null`.
export function editOutcome(event: SiteEvent): EditOutcome | null {
  if (event.type === 'edit.completed') return { kind: 'completed', ...event.payload };
  if (event.type === 'edit.conflicted') return { kind: 'conflicted', ...event.payload };
  return null;
}
