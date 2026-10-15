# Testing

`npm run test` runs Vitest over `tests/**/*.test.ts` in Node.

- A test reads an injected clock. The fleet gate fails a test that reads the wall clock.
- Each behaviour starts as a failing test. The commit of the failing test records the failure lines.
