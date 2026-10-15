# Starter site

A site built with Vite and TypeScript, with no UI framework. See the `README.md` of
`ratatoskr-site-sdk` for the manifest, the capabilities and owner mode.

## Reserved path

`.ratatoskr/sign-in/index.html` is the sign-in callback of the site owner. `/.ratatoskr/` is
reserved for the pages of the SDK: keep this page, and put no other page under that path.

## Publish and deploy

1. Call the reusable workflow `reusable-site-bundle.yml` of `ratatoskr-site-sdk` on a push to the
   default branch, with `site-id` set to the `site_id` of `ratatoskr-site.toml`. It builds the
   site, writes `ratatoskr-bundle.json`, pushes the bundle to `ghcr.io` as `sha-<commit>` and
   attests it.
2. Once per machine: `npx ratatoskr-site login --pairing-code <code> --site <site> --api <edge>`,
   with a pairing code of the kind `site_deployer` from the web client.
3. For each release of the site: `npx ratatoskr-site deploy --site <site> --commit <sha>`. Add
   `--no-activate` to upload without switching the site to the new commit.
