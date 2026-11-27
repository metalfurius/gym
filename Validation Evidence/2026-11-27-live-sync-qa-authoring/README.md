# Two-machine live QA runner: authoring handoff

**Live status: NOT RUN.** No real account, credential, browser login, Firebase request or service mutation was
used during authoring. The tests use injected synthetic Auth/Firestore responses, a memory control document and
a local loopback server serving synthetic Git blobs. They are not SYNC-04 acceptance or judge approval.

Worktree: `C:/tmp/gym-roadmap-live-qa`; branch `codex/roadmap-live-sync-qa`.
Started at `353d569152a7aa20b1df06ec566d0da34e6d5755`, then rebased with root authorization onto the two-fix
checkpoint `9a69595b33d6eb5f49475b5849e4a3e0d2bb0bb3`. Other worktrees and the dirty original checkout were not
edited. No application import, worker list, release metadata, package dependency or version was changed.
The [source/artifact manifest](source-manifest.json) records canonical source hashes and raw authoring artifacts;
the root's handoff identifies the subsequent local frozen commit.

## Implementation

- [Portable role A/B entry point](../../scripts/live-sync-qa.mjs), [fixed phase plan](../../scripts/live-sync-qa-scenarios.mjs),
  [scoped protocol/REST/coordination](../../scripts/live-sync-qa-protocol.mjs) and
  [canonical server/owned-browser adapter](../../scripts/live-sync-qa-browser.mjs).
- 39 declared scenario phases plus pre-auth source/calendar/fixture barriers. Control PATCH masks are per role;
  creation and role claims use CAS/existence preconditions. A failed role claim cannot publish over its owner.
- Fixed project/UID credentials, official Auth token UID/audience/issuer checks, no direct session/preference/
  policy/receipt writes, one create-only routine and verified CAS fixture cleanup. Baseline sessions remain
  unchanged; the sentinel, all session creation and all deletion use public UI.
- Fresh owned profiles persist across the full offline browser restart. Offline precedes navigation from
  `about:blank`; the real worker stays enabled. The assertions include queue/target/original timestamp parity,
  actual IndexedDB journal hash, UID, source revision, both reconnect orders and explicit conflict resolution.
- Existing eight Browser Gates matrix cases and sandbox body remain byte-for-byte equivalent after LF
  normalization, checked against body hash `a62d866ea25cf5506169892c265b14141c2b4ea1d19b1c84a77df02255316d96`.
  A separate branch/manual/boolean opt-in job receives the only credential-secret reference, only on its live step.
- Root authorized `baseCalendarIso` parametrization. Defaults are November 27 / December 4, 2026, noon UTC;
  second clock is exactly +7 days. The bounded fixture window and frozen-week rejection prevent unsafe resets.
  Later pairs permit reruns after the older selected week has legitimately frozen.
- Routine fixture creation happens only after both peers agree but before either browser's first auth. This
  exercises honest routine-cache behavior instead of deleting storage or calling an internal refresh to reveal
  a late REST-created routine. The later session phase verifies that unchanged fixture.
- Cleanup is independent; errors are retained and propagated to the peer, trace is attempted before final status,
  and both roles exchange final evidence readiness. Missing/failed artifacts or a nonzero process are failure.

## Executed authoring checks

| Check                                                        | Result                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                     | Exit 0; 400 packages; existing audit reports 18 moderate vulnerabilities; no dependency fix/update                      |
| `node --check` for all four new `.mjs` files                 | Exit 0; [static checks](static-checks.json)                                                                             |
| YAML parse                                                   | PyYAML 6.0.4, local ignored tool installation only; eight original matrix cases, default opt-in false, `contents: read` |
| New QA tests + existing owned-browser/runtime/sandbox suites | Exit 0; [4 suites / 49 tests](focused.txt), including 20 new QA cases                                                   |
| `npm run lint:ratchet` (ESLint 10)                           | Exit 0; [zero warnings](lint.txt)                                                                                       |
| `npm run test:no-skips`                                      | Exit 0; [no skipped tests](no-skips.txt)                                                                                |
| `npm run release:check`                                      | Exit 0; [existing v2.8.6 / 75 assets](release.txt), deterministic temporary two-build check; no working-copy bump       |
| CLI `--live` without credential environment                  | Expected exit 1, `QA_CREDENTIALS_JSON_REQUIRED`, empty stdout; no browser or Firebase call                              |

The first combined focused run exposed a test-only 8 ms scheduling assumption (`calls > 1`). The negative
condition still timed out correctly; the assertion now allows one or more attempts and also verifies an already
aborted signal cannot succeed. The renewed four-suite run above passes. Initial optional YAML parser discovery
found neither `js-yaml` nor PyYAML; PyYAML was installed under ignored `tmp/qa-yaml-check`, with no repository
dependency or global Python change. Raw authoring console files are retained; no live result is manufactured.

## Required root execution

Follow [the run instructions](../../docs/live-sync-qa.md) after integrating this local commit onto the final
objective-2 candidate and freezing its SHA. The root supplies private synthetic account credentials, configures
the opt-in secret, starts Windows A, dispatches Ubuntu B with the same new UUID/SHA/calendar pair, collects both
real artifacts and reviews all UI/server/queue/receipt results. Both selected weeks must be unfrozen; a retry
chooses a new UUID and later approved pair, never deletes outcomes or receipts. Existing canonical UID policy
and nonzero session revisions are valid preconditions, not a reason to reset service data.

No forced lost-Commit-response injection was implemented; it is explicitly excluded from claimed service
evidence. This authoring work does not establish two-machine convergence, deployed rules, phones/iOS, installed
PWA behavior or objective completion. Final integrated checks and two independent exact-head GPT-6.1-Sol xhigh
reviews remain the root's responsibility. No push, PR, workflow dispatch, secret write or merge was performed.

Fixture reproducibility was strengthened during root review: both clients hold the shared base offline; the stale public press is durably queued before reconnect. Cold restart also waits conditionally for the verified queue/target/records to restore. These are QA fixture improvements, not claims of a newly discovered application bug.

Root verification of local handoff `6ba9a9d`: all seven source hashes and six unchanged metadata hashes match Git. Four console text files were originally hashed with working-copy CRLF; the tracked artifacts use canonical Git LF. The original raw handoff is retained outside Git. The artifact hashes below describe the tracked LF bytes, including this note; source bytes and recorded test outcomes are unchanged. Root independently reran all 20 QA tests and the clean exact-SHA validation guard successfully without browser/service access.
