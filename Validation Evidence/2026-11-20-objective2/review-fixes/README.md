# PR106 review corrections — local evidence

**Current verification is recorded in the [November 27 handoff](../../2026-11-27-objective2/README.md).**
The resumed checkpoint below records the state before the receipt/tombstone and
proof-gated denial retry were implemented; its failing regression is now covered
by the fresh passing complete run. Keep the older outputs as historical evidence.

**November 27 resume: implementation is in progress again; do not freeze this
tree or treat the 942-test run below as current acceptance.** Subsequent work
separated accepted backend writes from failed cache completion, added recovery
work, and reproduced create → lost acknowledgement → delete → replay-create
resurrecting the same ID. The new `sync-protocol.test.js` regression currently
fails (`exists:true`, expected false). An immutable session receipt/tombstone
contract is being agreed with the parent rules owner before implementation.
Pending-cache recovery must prove a completed operation with an immutable
receipt, not infer completion from current document existence/absence. No server
rules, version bump, commit, push or deployment is performed by this implementer.

Historical November 20 status: local corrections and gates passed on the source
then tested, before the further changes above. This record supersedes
claims about acceptance of rejected head `a34b337293f4271c8c28dbcd672dd578c7d99b22`.
That head was reviewed against base `54e83fbfb263be2e601e1db3d2074275329de40e`;
both independent judges returned `REQUEST_CHANGES`. The earlier evidence one
directory above remains historical. No objective completion or published release
is claimed. Parent owns final SHA, server rules/deployment, live replay and renewed
independent reviews. This implementer has made no backend/account writes.

## Concrete findings and regression mappings

| Finding reproduced by judges | Correction | Deterministic regression |
| --- | --- | --- |
| A: IndexedDB delete abort was swallowed and a cold offline cache restored the server-deleted session. | Verified durable epoch barriers precede deletion; cold reads reject old epochs. Preflight must succeed before session RPC. Post-commit failure retains pending barriers. | `local-first-cache.test.js`: aborted physical remove/prefix deletion, independent cold cache, both-store failure, missing readback, abort-only transactions, post-commit failure/recovery. `sync-protocol.test.js`: backend transaction never starts when preflight fails. |
| B: A Quick Log pending → B auth/new notes → A completion erased B notes. | SessionManager returns stale status and the app continuation independently checks captured auth generation. | `app-sync-review-regressions.test.js`: actual submit/auth/note flow preserves B draft and controls. |
| B: scalar target 7, no dated map, four past-week sessions froze target 3/met true at first auth. | Normalize the known scalar baseline before the first finalization. | Same actual-app suite expects target 7, count 4, met false before any dated edit. |
| B: period change while initial Progress list read was pending left selector at Loading. | Separate list/chart request IDs and spinner ownership by operation. | Same actual-app suite holds the 301 query, changes period, releases list and asserts selector/spinner. Existing reversed exercise/period/error tests stay active. |
| A: legacy target merge changed 4 → 6 without revision/op change; stale intent 7 then overwrote it. | Require semantic base fingerprint as well as revision/op; preserve alias values independently for detection. | `weekly-preferences.test.js`: both aliases and legacy-alias-only merges conflict without changing the server record. |
| A: a legacy session writer bypassed counter, so one queried session froze despite two persisted sessions. | Global admin policy + immutable UID opt-in; no proof means limited data/no freezing. Query and outcome transactions verify policy/marker. Companion rules reject bypasses. | `sync-protocol.test.js`: absent/cached/pending/wrong epoch proofs cannot freeze; atomic onboarding/retry; outcome retry revalidation. Actual app renders unfenced history limited. Server enforcement is separately tested/deployed by parent. |
| CodeQL: Math.random fed persistent queue/session/target IDs. | Secure browser crypto only, no insecure fallback or suppression. | `secure-id.test.js`: entropy fallback, uniqueness, fail closed without crypto, Math.random throwing. |
| Implementer follow-up: failing cache completion after an accepted server write returned an error; a normal Quick Log retry created two session IDs. | Preserve the accepted backend result because verified pending barriers still prevent stale recovery; pass `invalidationVerified` to the publisher instead of repeating durable writes. | Actual-app regression forces storage failure only after backend acceptance, retries only on reported failure, and requires one persisted ID and a safe cold cache. |

The raw judge reproduction outputs are preserved here as `judge-a-before.json`
and `judge-b-before.json`. They describe rejected H, not the corrected source.
Source tests exercise the actual current UI/modules; Firestore mocks provide
generic snapshot/retry behavior and do not enforce the proposed server rules.

## Current commands

The focused first pass after the principal fixes passed 6 suites / 46 tests:

`npm test -- --runInBand tests/unit/local-first-cache.test.js tests/unit/sync-protocol.test.js tests/unit/weekly-preferences.test.js tests/unit/secure-id.test.js tests/integration/app-sync-completeness.test.js tests/integration/app-sync-review-regressions.test.js`

Subsequent tightening retains auth generation across preflight and bounds IDB
metadata reads. The following final local checks include that source. Runtime:
Windows NT 10.0.26200.0, Node v24.12.0, npm 11.6.2.

| Command | Exit | Observed result |
| --- | --- | --- |
| `npm ci` | 0 | Lockfile installation completed; no dependency files changed. Existing audit output reported 21 vulnerabilities (1 low, 13 moderate, 7 high); no dependency remediation is included in this objective. |
| `npm run lint:ratchet` | 0 | No warnings/errors. |
| `npm run test:no-skips` | 0 | No skipped test declarations. |
| `npm run test:app` | 0 | 6 suites / 6 actual-app journeys. |
| `npm run test:app:offline` | 0 | 2 suites / 2 offline journeys. |
| `npm run release:write` | 0 | Regenerated local **v2.8.5** with 71 cached assets; no version bump. |
| `npm run release:check` | 0 | Current graph verified; deterministic v2.8.5 → v2.8.6 fixture passed. |
| `npm run test:coverage:gate` | 0 | **65 suites / 942 tests passed**, statements **79.68%**, lines **82.18%**, required statements >=70%. |
| `npm run test:e2e:upgrade` | 0 | Controlled Chromium shell upgrade, explicit update action, exact draft preservation, offline restart and online recovery passed; console/exception arrays empty. |
| `git diff --check` | 0 | No whitespace errors. |

One initial full coverage run before metadata regeneration failed four release/
service-worker assertions (63 suites/938 tests passed; two suites/four tests
failed). Its manifest had 68 assets versus the new graph's 71 and obsolete source
hashes. The complete run above passed after regeneration; no functional tests or
gates were weakened. An early lint run found indentation/braces in new code;
these were corrected and the strict gate rerun.

The upgrade command ran after setting PowerShell
`$env:UPGRADE_SMOKE_EVIDENCE_DIR = 'C:/tmp/gym-roadmap-02/Validation Evidence/2026-11-20-objective2/review-fixes/upgrade'`.
No historical output path was overwritten. Browser: Chrome 157.0.8103.80.

`coverage-summary.json` and `junit.xml` preserve the final full run. `upgrade/`
contains the raw browser evidence, trace and screenshots. The browser fixture
uses simulated labels v2.7.0 → v2.7.1; they are not deployed application versions.
Its `checkoutSha` is the parent HEAD `a34b337` because this work is intentionally
uncommitted; that field does **not** claim the rejected commit contains these
fixes. `source-files.sha256.json` identifies the tested changed source/test/docs/
release bytes with LF normalization, preserving a UTF-8 BOM. `artifacts.sha256`
identifies attachments. Parent must pin a fresh run to the final frozen SHA.

## SYNC-01 through SYNC-07 matrix

| Criterion | Current local result | Still required for acceptance |
| --- | --- | --- |
| SYNC-01 | PASS in full run: existing reversed exercise/period/metric/error/library/History/Calendar races plus initial list/period ownership regression. | Fresh final-SHA reviews and relevant live cross-view observations. |
| SYNC-02 | PASS: A/B/A cache/queue/draft/version-backup cases and actual A-pending Quick Log → B-notes continuation. Preflight retains original auth generation. | Final two-client/account-switch evidence. |
| SYNC-03 | PASS with mocked Firestore: shared capture/Quick Log/replay/delete surface journey, exact-ID counts/suggestions/table/stats, first/last-page and offline reload. Aborted durable deletes cannot revive cold cached entries. | Repeat exact session IDs/counts/values on the designated backend clients. |
| SYNC-04 | PASS deterministic CAS/MVCC, different weeks, explicit conflicts, timestamps, offline chains and legacy semantic merge detection. | Real same/different-week concurrent/reconnect sequence on final SHA, enforced rules and both reloaded UIs. |
| SYNC-05 | PASS fixed UTC/Europe/Paris/America/Los_Angeles matrix with both DST changes; original timestamps and initial scalar-7 baseline preserved. | Final live replay/boundary observations where specified. |
| SYNC-06 | PASS empty/exact/over-cap/stale/offline/legacy cases, ES/EN limits and explicit no-proof/no-freeze behavior. Atomic policy onboarding and outcome revalidation tested. | Parent's real emulator/rules deployment and real proof that legacy marker/pref bypasses are rejected; final backend completeness cases. |
| SYNC-07 | PASS local common gates, 79.68% statement coverage, numeric/session/import/PWA compatibility and Chromium upgrade. | Final release regeneration after integration, immutable CI/CodeQL and two independent GPT-6.1-Sol xhigh verdicts on identical final SHA. |

## Completion dependencies

All SYNC-01 through SYNC-07 remain subject to the final candidate gates and two
new exact-model independent reviews. SYNC-04/SYNC-06 additionally require the real
rules/policy and two-client replay on the final SHA. Parent's earlier preliminary
live log cannot establish this new fence's deployment or the corrected source.
The [client contract](../../../docs/history-progress-sync-contract.md) gives the
required live steps; server deployment must precede an affirmative weekly-outcome
consistency guarantee. No rules files, production services, credentials or real
account documents were modified by this implementer.
