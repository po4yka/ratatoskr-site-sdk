import type {
  EditCompletedNotice,
  EditConflictedNotice,
  SiteEvent,
} from '../contracts/sites/site-event.v1.js';
import type { components } from '../generated/platform.js';

// RED stub of SITE-027 task 10.5: the client posts nothing and maps no event. Task 10.6 replaces
// it.

export type SiteEditAccepted = components['schemas']['SiteEditAccepted'];

export interface OwnerClientOptions {
  baseUrl: string;
  site: string;
  fetch?: typeof fetch;
}

export interface EditRequest {
  sourceRef: string;
  baseHash: string;
  markdown: string;
  idempotencyKey?: string;
}

export interface OwnerClient {
  edit(request: EditRequest): Promise<SiteEditAccepted>;
}

export type EditOutcome =
  ({ kind: 'completed' } & EditCompletedNotice) | ({ kind: 'conflicted' } & EditConflictedNotice);

export function createOwnerClient(options: OwnerClientOptions): OwnerClient {
  void options;
  return { edit: () => Promise.resolve({ operation_id: '', status: '' }) };
}

export function editOutcome(event: SiteEvent): EditOutcome | null {
  void event;
  return null;
}
