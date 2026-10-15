## Context

The source of this design is the workspace change `add-site-gateway-hosting`: design D3 (deploy
from the controller through Edge), D4 (the bundle and the `hashed` flag) and D7 (the reserved
`/.ratatoskr/` path), and the spec `site-bundles`. The pattern of the workflow is
`reusable-release-artifact.yml` of `ratatoskr-workspace`: push to `sha-<commit>` only when the tag
does not exist, then attest the pushed digest.

## Goals / Non-Goals

**Goals:**

- One bundle per commit, with a manifest that lists every file, and a tag that never moves.
- The deploy command checks the attestation and every file before it sends a byte to Edge.
- The device secret is never in the site repository.

**Non-Goals:**

- A deploy from the web client. Platform accepts a primary session for it later.
- Compression of the bundle. Design D4 asks for an uncompressed tar.

## Decisions

### 1. The workflow steps are subcommands of the package

The reusable workflow runs in the site repository. It runs `npx --no-install ratatoskr-site bundle
manifest` and `npx --no-install ratatoskr-site bundle publish`, so the steps come from the version
of `@ratatoskr/site-sdk` that the site locks. The tests run the same functions with a fake `oras`,
a fake `gh`, a fake credential store and a stub Edge, all injected, so a test starts no process
and reads no network.

### 2. The manifest step refuses a commit that is not `GITHUB_SHA`

The step takes the commit that was built (`git rev-parse HEAD` in the workflow) and fails when
`GITHUB_SHA` names another commit, so a bundle never names a commit that the run did not build.
It marks a file `hashed` when the path matches one of the `--hashed-globs` (default `assets/**`).
It refuses a symbolic link, a path under `_r/` and a missing entry document.

### 3. The tar is written and read by the package

The bundle is a ustar archive with `ratatoskr-bundle.json` first and the listed files after it, in
the order of the manifest. A path longer than 100 bytes uses a PAX `path` record. Every entry has
mode `0644`, owner 0 and time 0, so one build output gives one archive. The deploy command reads
the archive in memory and accepts only regular files and PAX records, so it writes no path from
the archive to the disk.

### 4. The deploy command verifies by digest

`deploy` resolves `sha-<commit>` to a digest with `oras resolve`, runs `gh attestation verify
oci://<image>@<digest> --repo <repository> --source-digest <commit> --signer-workflow
po4yka/ratatoskr-site-sdk/.github/workflows/reusable-site-bundle.yml`, pulls that digest, and
checks the manifest: the site, the commit, the repository, and the size and SHA-256 of every file,
with no file that the manifest does not list. Then it opens a device session and posts the tar,
then the activation unless `--no-activate`. The repository is `--repository`, or else the GitHub
remote `origin` of the working directory.

### 5. `login` keeps the device secret in the credential store of the system

`login --pairing-code <code> --site <site> --api <url>` pairs a device of kind `site_deployer`
and stores the API address, the device id and the device root secret in the credential store:
the macOS keychain through `security`, or the Secret Service through `secret-tool` on Linux. It
writes no file. `deploy` opens a new device session with the root secret on each run, so it keeps
no refresh chain.

## Risks / Trade-offs

- [Two runs for one commit can both see no tag] → The second push writes the same tag again. The
  workflow runs on `push` of one commit, and the receipt on the host checks every digest again.
- [The site locks an older SDK than the workflow pin] → The workflow input and the step options
  are one version line, and the README tells the owner to move both together.
