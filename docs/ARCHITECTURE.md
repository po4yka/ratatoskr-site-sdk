# Architecture

## Context

A site is a static bundle in the owner's own repository. It reads the current release of its
publications at run time from the Content Delivery API of `ratatoskr-sites`, through the `public`
route class of Edge (workspace change `add-site-publications`, design D10; ADR-0011).

```text
visitor browser ──GET /_r/v1/sites/{site}/content/...──▶ sites gateway ──▶ Edge (public) ──▶ ratatoskr-sites
      ▲
      └── site bundle (built from template/, uses @ratatoskr/site-sdk)
```

## Parts

| Part | Job |
|---|---|
| `src/` | The package `@ratatoskr/site-sdk`. |
| `src/contracts/` | The generated TypeScript of the site contracts, vendored from `ratatoskr-contracts`. |
| `src/generated/` | The types of the Content Delivery API, generated from `openapi/`. |
| `src/client.ts` | The typed client for the four delivery routes. |
| `contracts/` | The lock of the vendored files, the contract schemas and the fixtures that the tests serve. |
| `openapi/` | The Content Delivery API description from `ratatoskr-sites`, and its lock. |
| `template/` | The starter site: Vite and TypeScript, no UI framework. |

## Rules

- The types come from the pinned contracts.
- The template renders a page from its `ast` with DOM nodes and text.
- The template reads only the anonymous routes under `/v1/sites/{site}/content/`.
