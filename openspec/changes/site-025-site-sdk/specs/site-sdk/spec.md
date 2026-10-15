## ADDED Requirements

### Requirement: The starter template lists the pages of the current release

The starter template SHALL build with no code change and, on its home page, SHALL list the title of
every page of the current release that the delivery API serves, each as a link to the page view of
its slug.

#### Scenario: The template reads the fixture release

- **WHEN** the template is built and run against a stub delivery API that serves the contract
  fixtures `fixtures/sites/release/valid/minimal.json` and `fixtures/sites/page/valid/*.json`
- **THEN** the home page shows the four fixture page titles, verified by
  `template/tests/fixture-release.test.ts` "home page lists the fixture pages"

### Requirement: The template renders a page from its ast

The page view of the template SHALL render the `ast` of a page with DOM nodes and text, and SHALL
NOT insert the `html` member of the page into the document.

#### Scenario: A page with a heading, a callout and a wiki link

- **WHEN** the built template opens the page view of the fixture page `handbook/start` and of the
  fixture page `handbook/links`
- **THEN** the view shows the heading and the callout title of the first page, shows the wiki link
  of the second page as a link to the page view of `handbook/start`, and contains no element with
  the `data-wikilink` attribute that only the `html` member carries, verified by
  `template/tests/fixture-release.test.ts` "a page renders from its ast"

### Requirement: The generated client matches the pinned contracts

`@ratatoskr/site-sdk` SHALL expose a typed client for every route of the Content Delivery API,
generated from the published API description, and its check SHALL fail when the committed
generated code differs from a fresh generation.

#### Scenario: The generated client drifts

- **WHEN** the API description changes and the client is not regenerated
- **THEN** the check fails and names the changed file, verified by
  `scripts/check-generated.test.ts` "generated client matches the pinned contracts"
