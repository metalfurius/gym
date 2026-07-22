# Gym PWA update delivery — final review

Date: 2026-07-22
Base reviewed: `2ea99c4be165155538a48639b61f735fb62b9fbe` (`main`, v2.7.1)
Review head: `d33c6a0`

## Review coverage

- Inspected the complete branch diff against current `main`, including release workflows, cache headers, manifest/shell metadata, service-worker install/fetch/activate/message paths, version-manager call sites, release generation, and unit/browser evidence.
- Checked update concurrency and recovery paths: a replacement worker must finish its cache before activation; activation is explicit; controller changes reload once; metadata is network-first/no-store; old release caches are removed only from the activated replacement; the in-progress session is backed up and restored through reload/offline recovery.
- Checked security and consistency boundaries: API/non-allowlisted cross-origin GETs are not cached; notification text uses DOM text nodes; update state has an accessible live status; release hashes normalize text line endings to deployed bytes.

## Findings resolved

- Merged the current main base so the dependent Progress correctness changes are included and the release contract is v2.7.1.
- Made release-integrity hashes deterministic across Windows and Linux checkout line endings.
- Made Chromium startup tolerate slower hosted runners and made the browser hash assertion use the same canonical text bytes as release-integrity.
- Updated fallback release metadata with the current revision and made future version bumps update those fallbacks.
- Restricted service-worker external caching to the explicit CDN asset allowlist.

## Validation

- Local: `npm run release:check`, unit (36 suites / 645 tests), integration (7 suites / 45 tests), app and offline journeys, coverage gate (72.23% statements), lint ratchet, no-skips, Chromium desktop/mobile upgrade, and Firefox upgrade all passed on the reviewed implementation.
- CI on the immediately preceding equivalent implementation passed release-integrity, Chromium upgrade smoke, app/offline tests, coverage, ESLint, Prettier, CodeQL, and Copilot checks. The final review commit is queued for the same required checks.
- Remaining non-blocking environment notices are the repository’s existing npm audit findings and GitHub’s Node 20 action deprecation annotation; neither required a dependency or product-scope change.

No unresolved review findings or debug-only code remain in the reviewed diff.
