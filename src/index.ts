// The public entry point of `@ratatoskr/site-sdk`: the contract types of a release, a page and a
// site manifest, from the generated TypeScript of the pinned contracts (`src/contracts/`), and the
// typed client of the Content Delivery API (`src/client.ts`). The three contract files declare
// their shared names (`SiteId`, `Slug`, ...) each, so the names are listed.
export type {
  DigestHex,
  MediaType,
  NavigationEntry,
  PageTitle,
  PublicationId,
  Release,
  ReleaseAsset,
  ReleasePage,
  SiteId,
  Slug,
} from './contracts/sites/release.v1.js';
export type {
  Anchor,
  AssetRef,
  CalloutFold,
  CalloutKind,
  EmbedTarget,
  ImageUrl,
  LinkUrl,
  Page,
  PageNode,
  PageRoot,
  PageRootType,
  TableAlign,
} from './contracts/sites/page.v1.js';
export type { Hostname, SiteCapability, SiteManifest } from './contracts/sites/site-manifest.v1.js';
export { createContentClient, DeliveryError } from './client.js';
export type {
  ContentClient,
  ContentClientOptions,
  DeliveryAnswer,
  DeliveryPage,
  DeliveryRelease,
  ErrorEnvelope,
  HeadAnswer,
  ReadOptions,
  SearchQuery,
  SearchResult,
  SearchResults,
} from './client.js';
