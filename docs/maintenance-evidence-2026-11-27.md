# Maintenance publication, November 27, 2026

Published prerequisite, **not closure of objective 4**. QA-05 requires physical Safari/iOS and Home Screen PWA
observations that have not been run. Objective 1's previous installed-client update journey also remains open.

## Reviewed and published source

- Maintenance [PR #109](https://github.com/metalfurius/gym/pull/109): base
  `ebb887b967ec22b021858bf1feaa79010c4b1605`, approved head
  `3e30a1b195225bd37efb10371444ba73d8b5f5f2`.
- Two distinct independent GPT-6.1-Sol xhigh judges approved that identical head after the actual required
  CodeQL check passed. Neither authored the change. Their acceptance was explicitly scoped to the prerequisite.
- Normal squash merge at **2026-11-27 15:11:32 UTC**:
  `fd82d8080007c19426a47a17cddb3428ea6ab59d`. Approved and merged Git trees are identical:
  `7a5bc18413bff2f6155bd6124247b1b43aca576d`.
- [Release v2.8.5](https://github.com/metalfurius/gym/releases/tag/v2.8.5), published **15:12:01 UTC**;
  revision `v2.8.5`, 61 cached assets. This release contains maintenance and the earlier reviewed prerequisites,
  not the unmerged history, persistent Daily Hub, backup or saved-workout editor implementations.

The major ESLint migration, Jest/Prettier changes, immutable official Action pins, permanent coverage floor
and command-to-CI corrections are described in [the migration](eslint-10-migration.md),
[browser gates](browser-quality-gates.md) and [historical source evidence](../Validation%20Evidence/2026-11-27-objective4-maintenance/README.md).
PRs [#67](https://github.com/metalfurius/gym/pull/67) and [#70](https://github.com/metalfurius/gym/pull/70)
were closed after #109 merged; each body identifies the replacement. Eighteen moderate application-tooling
audit findings remain documented, with zero high/critical. The isolated emulator tooling has its own 14
moderate findings; these are separate dependency trees, not a combined count.

## Executed checks

| Scope | Actual run / outcome |
| --- | --- |
| Reviewed head | [Shared tests](https://github.com/metalfurius/gym/actions/runs/46019955555): 60 suites / 894 tests, 74.95% statements, app/offline and browser transport/upgrade passed; reporter v3 and Codecov v6 executed |
| Reviewed head browsers | [Eight Linux/Windows jobs](https://github.com/metalfurius/gym/actions/runs/46019955523), pinned Chromium/Firefox: passed |
| Reviewed head rules | [Actual Java emulator](https://github.com/metalfurius/gym/actions/runs/46019955290), 17 cases: passed |
| Reviewed head CodeQL | [Real required check 140577306788](https://github.com/metalfurius/gym/runs/140577306788): completed/success |
| Published source tests | [Main tests](https://github.com/metalfurius/gym/actions/runs/46022678348): passed |
| Published source browsers | [Main browser matrix](https://github.com/metalfurius/gym/actions/runs/46022678425): all eight passed |
| Published source rules | [Main rules emulator](https://github.com/metalfurius/gym/actions/runs/46022678133): passed; this does not deploy rules |
| Published source CodeQL | [Main scan](https://github.com/metalfurius/gym/actions/runs/46022678289): passed |
| Main-only release Actions | [Create Release](https://github.com/metalfurius/gym/actions/runs/46022678206): passed, release action v3 executed |
| Pages | [Deployment workflow](https://github.com/metalfurius/gym/actions/runs/46022677867): passed; deployment **8113119805** matches exact published SHA |
| Live Cloudflare delivery | [Purge and Verify Canonical Cache](https://github.com/metalfurius/gym/actions/runs/46022758077): passed at **15:12:45 UTC** |

CodeQL alerts 7 and 25 represent the same local-preview `stat` → `readFile` flow, duplicated at a formatting-only
location change. Both judges independently classified it as a contextual false positive: `stat` selects file
versus directory/index.html and makes no authorization, ownership or privilege decision; this server exposes
no remote filesystem write or privilege elevation. Maintainer dismissals record that reasoning. The real check
then recalculated green. No query was suppressed, check result manufactured, or required gate bypassed.

## Real canonical delivery

The production workflow verified the active account token and the existing fixed Gym bypass rule at index 2,
after the global matching cache rule. The rule was already correct and was verified, not recreated. The portfolio
rule was not changed. The workflow waited for the exact matching Pages deployment, purged 64 canonical URLs
in three batches, then passed two complete 64-response sweeps ending **15:12:36.808** and **15:12:44.513 UTC**.
Canonical requests contain no cache-busting query. The artifact records the actual challenge-browser transport,
headers, response hashes, release metadata, deployment checks and per-response verdicts.

The [committed artifact](../Validation%20Evidence/2026-11-27-maintenance-publication/production-release-smoke.json)
is the downloaded workflow JSON with CRLF normalized to LF. Its
[checksum record](../Validation%20Evidence/2026-11-27-maintenance-publication/checksums.json) distinguishes these
canonical Git bytes from the original downloaded bytes, whose SHA-256 is
`936630b18e70b4ba95cfd7f2a44213dedc4414d659eb6bcda41311cf9cf4188e`.
No credential values appear in this evidence.

## Criterion disposition

| Criterion | Status and remaining boundary |
| --- | --- |
| QA-01 | Passed for the maintenance prerequisite: replacements merged, both superseded PRs closed |
| QA-02 | Passed for the selected toolchain/Actions, including observed main-only release action execution |
| QA-03 | Passed: documented commands and blocking/advisory policy align; permanent 70% floor remains |
| QA-04 | Passed for the required Linux/Windows matrix and its isolated pinned-browser infrastructure |
| QA-05 | **Not run / open:** physical iOS Safari and installed Home Screen PWA scenarios |
| QA-06 | Passed automated app/offline/coverage/release and Chromium/Firefox upgrade scope; no physical-device claim |
| P0 installed-client criterion | **Open:** successful public sweeps do not prove an old OS-installed app preserved a workout through update |

Stricter Firestore source from #108 is merged and emulator-tested, but the real backend has **not** been deployed
or globally activated. Unmerged client features must complete their own dependency integration, backend checks
and two exact-head reviews before publication. No complete roadmap objective is closed by this record.
