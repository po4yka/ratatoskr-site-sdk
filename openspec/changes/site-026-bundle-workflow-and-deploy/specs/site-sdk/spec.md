## ADDED Requirements

### Requirement: The manifest step lists every file and marks the hashed files

The manifest step SHALL write `ratatoskr-bundle.json` (contract `sites/bundle-manifest.v1`) at the
root of the build output. It SHALL list every file with its path, size and SHA-256, and SHALL mark
a file `hashed` exactly when its path matches a hashed glob. It SHALL fail and write nothing when
the commit that it names differs from `GITHUB_SHA`.

#### Scenario: A build output with assets

- **WHEN** the manifest step runs on a fixture build output with the default glob `assets/**`
- **THEN** exactly the files under `assets/` have `hashed: true`, verified by
  `tests/bundle-manifest.test.ts` "marks files that match hashed-globs"

#### Scenario: The manifest names another commit

- **WHEN** the manifest step runs with a commit other than `GITHUB_SHA`
- **THEN** it exits non-zero and writes no manifest, verified by `tests/bundle-manifest.test.ts`
  "fails when the manifest commit differs from GITHUB_SHA"

### Requirement: The publish step never moves a tag

The publish step SHALL push the bundle to `sha-<commit>` only when that tag does not exist. When
the tag exists, it SHALL push nothing, report that the artifact exists, and exit 0.

#### Scenario: The workflow runs again for a commit

- **WHEN** the publish step runs with a fake `oras` that reports the tag as present
- **THEN** no push is recorded and the step exits 0 with the message that the artifact exists,
  verified by `tests/bundle-workflow.test.ts` "keeps an existing tag"

### Requirement: The deploy command verifies before it uploads

`ratatoskr-site deploy` SHALL verify the attestation of the artifact and check every file against
the manifest before it sends a request to Edge. It SHALL refuse a bundle for another site. After
the checks it SHALL upload the bundle and then activate it, with a device session.

#### Scenario: The attestation is not valid

- **WHEN** the fake `gh` rejects the digest
- **THEN** the command exits non-zero and the stub Edge records no request, verified by
  `tests/deploy.test.ts` "refuses an artifact without a valid attestation before any request"

#### Scenario: The bundle is for another site

- **WHEN** the command deploys to site `b` a bundle whose manifest names site `a`
- **THEN** the command exits non-zero and the stub Edge records no request, verified by
  `tests/deploy.test.ts` "refuses a bundle for another site"

#### Scenario: A valid bundle

- **WHEN** the command deploys a valid bundle
- **THEN** the stub Edge records the upload and then the activation, both with the device
  session, verified by `tests/deploy.test.ts` "uploads then activates"

### Requirement: Login keeps the device secret outside the repository

`ratatoskr-site login` SHALL store the device secret in the credential store of the system and
SHALL write nothing under the working directory.

#### Scenario: The owner logs in with a pairing code

- **WHEN** `ratatoskr-site login --pairing-code` runs in a site repository
- **THEN** the fake credential store holds the device secret and the working directory is
  unchanged, verified by `tests/deploy.test.ts` "stores the device secret outside the repository"
