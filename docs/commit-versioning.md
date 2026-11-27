# Release version and cached-asset contract

The release owner updates the contract explicitly before review. The workflow file
[`version-bump.yml`](../.github/workflows/version-bump.yml) is named **Version Metadata** and validates
matching PRs; it does not bump versions or commit files. Commit keywords and labels do not trigger a bump.

## Preparing a release

From a clean, supported checkout after the final asset edits:

```sh
npm ci
node update-version.cjs patch
npm run release:check
```

`update-version.cjs` also accepts `minor`, `major` or an explicit `X.Y.Z`. With no argument it uses `patch`.
Use a patch for compatible fixes, a minor for compatible features and a major for intentional breaking changes.
Commit keywords such as `[patch]` can document that decision but do not execute this command.

The script updates `manifest.json`, the `gym-release-revision` marker in `index.html`, the embedded `sw.js`
revision and the defaults in `js/version-manager.js`. It then writes `release.json` with SHA-256 hashes for
the local worker-cache asset set. Review and commit the resulting files with their source changes.
`npm run release:write` only refreshes generated metadata for the chosen revision; it does not choose or bump
a version. Changed cached assets require fresh metadata; an inconsistent contract must fail review/CI.
Tooling/docs-only changes do not require a product release bump.

`npm run release:check` (also `build:check`) validates revision agreement, hashes, local references and two
consecutive deterministic builds. It does not publish or modify the release. Run the Chromium/Firefox
upgrade fixtures and the remaining [quality gates](../TESTING-PLAN.md) on the final committed candidate.

## What automation does

- [Tests](../.github/workflows/test.yml) validates release integrity on PRs/main alongside automated tests.
- [Version Metadata](../.github/workflows/version-bump.yml) adds a read-only release check for its matching
  PR paths. It has no write permission or automatic versioning step.
- [Create Release](../.github/workflows/release.yml) runs on main pushes affecting its declared release
  paths, verifies the contract, reads the manifest version, and creates the tag/GitHub release if absent.
  It uses the already prepared version, rather than interpreting commit messages.
- [Cloudflare cache control](../.github/workflows/cloudflare-cache.yml) waits for the exact successful Pages
  deployment, reconciles the fixed cache policy, purges and checks canonical release coherence. Production
  credentials and production-environment configuration are operational inputs; a local check does not execute them.

A green release-integrity check, GitHub release, successful Pages deployment, canonical production sweep and
old-installed-client upgrade are different observations. Record the deployed SHA/revision and actual device
results before closing the [production-delivery](roadmap/01-production-delivery.md) or
[browser/device](roadmap/04-maintenance-quality.md) objective. Freeze metadata before the required two
identical-head reviews; generating it afterwards creates a new candidate.
