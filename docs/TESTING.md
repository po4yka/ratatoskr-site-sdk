# Testing

`npm run test` runs Vitest over `tests/**/*.test.ts` and `template/tests/**/*.test.ts` in Node.

- A template test builds the template with Vite into a temporary folder. One loopback HTTP server
  plays the sites gateway: it serves the build, and it answers the delivery routes under `/_r/`
  from the contract fixtures in `contracts/fixtures/`. The test opens the site in a happy-dom
  browser, which runs the built module bundle and its `fetch` calls. No browser is downloaded.
- The fixtures are byte-exact copies of the `ratatoskr-contracts` fixtures, checked by
  `npm run contracts:check`.
- A test reads an injected clock. The fleet gate fails a test that reads the wall clock.
- Each behaviour starts as a failing test. The commit of the failing test records the failure lines.
