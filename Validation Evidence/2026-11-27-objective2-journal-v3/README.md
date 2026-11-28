# Objective 2: atomic causal outbox journal correction

Status: **local implementation checks passed; not frozen, published, or objective
closure**. Checkout base is `62b71bdf8831b1d5140c2f6103aceca370ad4d7e`; all changes
in this record are uncommitted on that base. `source-manifest.json` identifies
the actual corrected files using raw and LF-normalized SHA-256 (BOM preserved).
The smoke's `checkoutSha` is the base checkout, not a claim that committed 62b
passes. The parent owns integration, the next release, final-head CI/CodeQL,
two independent GPT-6.1-Sol xhigh reviews and final backend acceptance.

The runtime remains local/unpublished v2.8.5, with 75 cached assets. `release.json`
was regenerated without changing app/manifest/service-worker version constants.
No commit, push, rebase, backend write, production account access or deployment
was performed for this correction.

## Baseline findings and executed reproductions

The four `baseline-62b/*.json` files are exact copies of judge A's historical
results from `C:/tmp/gym-pr106-judge-a-62b/`. They were not rerun against modified
source or relabeled as current results. Their corresponding independent scripts
are `equal-clock-order.mjs`, `equal-clock-weekly-impact.mjs`,
`partial-outbox-ui.test.js`, and the external cleanup-injection harness recorded
by `cleanup-failure-verified-summary.json`.

| Confirmed baseline result | Corrected path and executed regression |
| --- | --- |
| V2 equal timestamps restored `a-second` before `z-first`. The actual weekly reducer finished at target 4 instead of 7, leaving the second intent conflicted. | V3 explicit causal edges and operation-ID dependency mapping. Actual Settings tests exercise equal and 60-second-backward enqueue clocks, cold restore, deliberately reversed RAM and final target/UI/Hub 7. Native Chromium also executes rollback-clock Settings 4→7 and same-UID two-tab order/ACK checks. |
| An IDB intent-put failure left an LS ghost. First public Quick Log returned `ok:false`; normal retry added a second ID; reconnect created two sessions. | One immutable authoritative batch, no temporary-IDB fallback, staging without background auto-persist, descriptor persistence before RPC and serialized proven-abort rollback. Actual Quick Log tests cover offline/online enqueue abort before any RPC, form retry, and exactly one accepted session; deliberate equal sessions still count twice. Native tests observe request-success→tx-abort and request-error→tx-complete with no ghost, then one session after retry/replay. |
| Owner cleanup threw after `passed` JSON was written: exit 1, evidence still passed, no trace. | Final status is published after isolated cleanup attempts. The real negative child exits 1, records failed JSON with the owner cleanup error, preserves the matching run-ID trace and completes later server cleanup. The verifier passes only when those failures are correctly represented. |

The native negative uses real IndexedDB transactions and `Storage.setItem`, with
explicit fault injection; the Firebase transport remains the repository's
synthetic SDK. It proves local storage/UI/replay behavior, not live Firestore.

## Contracts retained and added

The [V3 contract](../../docs/outbox-journal-v3.md) defines authority, batch shape,
terminal transaction events, receipt/outcome semantics, rollback, causal sorting,
semantic blocking and legacy handling. The
[shared synchronization contract](../../docs/history-progress-sync-contract.md)
documents the unchanged UID/generation, session receipt, counter/epoch,
fingerprint and completeness contracts consumed by later objectives.

- `predecessorIds` order observed intents; clocks do not order them. Semantic
  dependencies resolve all three payload aliases: `baseOperationId`,
  `parentOperationId`, `predecessorOperationId`, including operation IDs that
  differ from queue IDs and parents imported during persistence.
- Failed/conflicted/unknown/cancelled parents cannot issue descendant RPCs. An
  independent different-week edit proceeds. A deliberately reviewed new accepted
  save clears only that week's conflict/blocked chain.
- Expected IDB is authority. LS mirrors and post-commit refresh/observers cannot
  turn an accepted intent/RPC into a failed capture. Unknown completion preserves
  the identity. Permanent errors require durable cancellation before returning
  failure. An ACK persistence failure is repaired before same-realm replay.
- V1 valid copies contribute their FIFO union; contradictions and unprovable V2
  order/ACK outcomes are quarantined rather than guessed. Original timestamps,
  Spanish wire fields and opaque typed-codec strings remain unchanged.
- A live verified accepted/cancelled receipt is re-persisted atomically if its
  storage was evicted. Missing proof in a cold reader remains blocked. This also
  preserves the existing routine-import suite, whose setup clears LS after auth;
  terminal IDs remain immutable and are not reused by later fixture cases.
- Older session-mutation tickets still block cache reuse after an unrelated
  success. The prior S1-unknown/S2-success native regression remains in this
  smoke: eight pending rows still identify S1 and a cold page restores `null`.

## Executed local gates

Node v24.12.0 on Windows; Chrome for Testing 158.0.8127.36. Commands ran in the
isolated 02 worktree. Every command below exited 0.

| Command | Observed result / artifact |
| --- | --- |
| `npm ci` | Completed before implementation; dependency manifests unchanged. |
| `npm run lint:ratchet` | Zero warnings/errors; `lint.txt`. |
| `npm run test:no-skips` | No skipped tests; `no-skips.txt`. |
| `npm run test:app` | 6 app suites / 6 journeys pass; `app.txt`. |
| `npm run test:app:offline` | 2 suites / 2 journeys pass; `offline.txt`. |
| `npm run test:coverage:gate` | 71 suites / 1050 tests pass; statements 80.62%, lines 83.17%, branches 70.42%, functions 87.48%. `coverage.txt`, `coverage-summary.json`, `junit.xml`; staged statements requirement >=70%. |
| `npm run release:write` | Generated local v2.8.5 metadata without bump; `release-write.txt`. |
| `npm run release:check` | Two-build reproducibility/integrity pass, 75 assets; `release.txt`. |
| `npm run test:e2e:outbox` | Actual native Chromium positive passed; `browser-positive/result.json` and matching trace. |
| `npm run test:e2e:outbox:negative` | Verifier passed; deliberate child exit 1 / evidence failed / trace retained. `browser-cleanup-negative/negative-verification.json`, child result/trace/stdout/stderr. |
| `npm run test:e2e:upgrade` | Controlled A→B service-worker upgrade, retained draft, offline restart/reconnect pass; `upgrade/evidence.json`, trace and screenshots. Uses synthetic fixture release labels v2.7.0/v2.7.1, not a deployed downgrade/upgrade claim. |
| `git diff --check` | No whitespace errors; Windows checkout normalization warnings are not test failures. |

The new unit and actual-app suites are `tests/unit/outbox-journal-v3.test.js` and
`tests/integration/app-outbox-journal-v3.test.js`. They cover one-batch atomicity,
native terminal-event contracts, scheduled-persist abort/unknown races, equal and
backward clocks, stale RAM order, old restore completion, imported parent proof,
cycles/identity contradictions, V1/V2 handling, cancelled/missing parents versus
remote CAS, independent-week eligibility, opaque `-0`/NaN/int64/nanosecond fields,
and accepted RPC/mirror/refresh/ACK behavior. All previous session-counting,
numeric validation, account/draft/backup, race and completeness tests run in the
full suite. Focused tests or injected faults do not replace a real backend run.

To reproduce native checks with the same downloaded browser, set `CHROME_PATH`
to the available Chrome for Testing executable. Set `OUTBOX_SMOKE_EVIDENCE_DIR`
and `UPGRADE_SMOKE_EVIDENCE_DIR` to new directories before running the commands;
do not overwrite this historical record. A cold queue/page read is distinguished
from a full browser-process restart; the outbox smoke performs the former.

## SYNC-01–07 matrix and remaining acceptance

| Criterion | Executed local evidence | Still required for completion |
| --- | --- | --- |
| SYNC-01 latest selection/account wins | Existing actual app race/account/review suites in the 1050-test run remain green; late queue restores are now rejected by queue generation. | Final merged/frozen SHA checks and independent review; final account/browser replay owned by parent. |
| SYNC-02 no ownership crossing | UID-owned queue, retained foreign intents, ownerless quarantine, draft/backup and ABA cases remain green. V3 operation-parent resolution is per owner and cross-owner edges quarantine. | Final real independent-client/account-switch/cold-offline evidence on the accepted SHA. |
| SYNC-03 cross-surface save/replay/delete agreement | Existing actual app save/delete/surface tests pass; new public Quick Log retries create exactly one accepted ID, equal captures create two, and the native smoke retains the older-unknown cache barrier. | Real server IDs/counts/values across History/detail/Calendar/Progress/chart/table/stats/suggestions/Hub, including same-day sessions and last-page deletion. |
| SYNC-04 convergence/no stale overwrite | Atomic CAS/revision/fingerprint/retry tests pass; V3 causal Settings 4→7 reaches 7 after equal/backward clocks; failed semantic children do not RPC while unrelated weeks proceed. Native stale-tab ACKs do not resurrect intents. | Executed final two-client same/different-week concurrent writes, offline/reconnect in both orders, explicit conflict resolution, server receipts and reloaded UIs. |
| SYNC-05 clock/week/original time | Existing UTC/Paris/Los Angeles and DST matrix passes; causal equal/backward-clock tests compare original queue/logical timestamps. | Repeat required real acceptance boundary cases; final SHA evidence binding. |
| SYNC-06 honest bounded completeness | Existing empty/exact/over-cap/offline/stale/protocol fence tests pass. Cache/barrier behavior remains fail closed; no session-query bounds or fence rules changed here. | Authoritative deployed rule/policy proof and real freeze rejection/acceptance evidence; fixtures cannot establish backend enforcement. |
| SYNC-07 compatibility/release | All common local gates, routine import, numeric/session counting and actual Chromium upgrade pass; no dependency/version bump. | Parent integration/release regeneration, final-head hosted CI/CodeQL and both independent exact-SHA approvals. Physical iOS/Safari was not run by this correction. |

No real-backend mutation or two-client acceptance was run by this implementer.
Earlier parent preliminary observations remain preliminary and are not promoted
to acceptance by these local results. The next real run must record the final
client SHA/release, reviewed deployed rules/global epoch, original timestamps,
server documents/receipts and both isolated clients. Use only the designated
synthetic account and its explicitly authorized IDs; do not create/export tokens
or inspect other accounts.

The journal is append-only and has no compaction in this correction. Quota
failure is explicit before new RPCs. Complete storage deletion in a cold tab
cannot recover a lost pending intent. V2 QA intents with irrecoverable ordering
remain quarantined for review. These are material limits, not passed recovery or
live guarantees. Final objective completion remains pending.

## Parent checkpoint normalization

Before committing this historical handoff, the parent verified all 23 raw source and 30 raw artifact hashes, then checked the canonical Git bytes. Console-table trailing padding and redundant final blank lines in text logs were removed to pass the staged whitespace check; CRLF is normalized to LF. The original raw logs/manifests remain at `C:/tmp/gym-roadmap-02-v3-handoff-raw` locally. Artifact hashes below were refreshed for those representation-only changes; runtime source hashes and test results are unchanged.
