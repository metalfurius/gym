# Isolate independent native outbox fixtures

Local fixture-only candidate based on exact
`bdab128435e128a70bce1a382bfa22340cb64c74`, branch
`codex/roadmap-outbox-fixture-isolation`. This does not close a roadmap objective
or establish backend/device acceptance. The parent owns integration and reviews.

## Cause and change

The independent Windows judge's unchanged baseline reached six capture cases
and seven of eight durable primary/mirror cases, then timed out. Its elapsed time
including cleanup was **216.303 s**, cleanup errors were empty, and the final
mirror/cold case did not complete. Those original files remain untouched at
`C:/Users/Fran/AppData/Local/Temp/gym-judge-b-bdab-native-aace20b4b17041589181bea78b73b9fb`.
`baseline-summary.json` records their hashes and scope. The failing baseline was
not rerun to obtain a passing sample. The parent also reported 170.6/180-second
local runs and passing Ubuntu CI at 66/72 seconds; those are context, not new
executions here.

Previously independent app cases accumulated one journal and active pages in a
single origin. The runner now assigns **26 independent scenarios** unique
loopback ports in one owned Chromium profile. All servers remain listening until
final cleanup, preventing port/origin reuse. Finished scenario pages close only
after their assertions finish. No journal, draft, cache or SDK snapshot is cleared
to make another scenario pass.

The core A/B, stale-tab, cold restore, acknowledgement, causal-order and pending
barrier scenario body is byte-identical after LF normalization. Each failure/retry,
two-deliberate-capture, ABA, weekly chain and legacy-PWA scenario retains its own
complete sequence. Every durable primary/mirror × before/after ACK × warm/cold
case shares its origin/profile/IDB between producer and resumer. Cold page calls
pass the producer's origin explicitly, retaining the origin-scoped SDK snapshot.

The runner records scenario IDs, origins, profile ID, page targets, native journal
counts/bytes/hashes, timing and per-server cleanup. A module-only probe checks a
fresh origin **before** app initialization. The app can legitimately append a
fetch intent and acknowledgement during initialization. After all scenarios,
module-only probes revisit all 26 origins and compare the full IDB journal hash,
byte length, row count and local mirror count against each completed scenario.
The original rows remain available after their pages close. These probes use no
Firestore queries and execute no queued operation.

Every owned connection/server is cleaned independently. Final status is written
after cleanup and trace persistence; an expired 180-second signal cannot report
success. The cleanup negative retains child exit 1 only for the deliberate owner
cleanup exception, and verifies matching-run cleanup of all 26 servers plus all
26 retained journals. The CI timeout remains **4 minutes**; neither limit changed.

## Executed evidence

Node v24.12.0 / Windows, pinned native Chromium **158.0.8127.36**, synthetic Firebase
SDK transport with native localStorage and IndexedDB. These are local fixture
observations, not a live backend run, a product performance SLA or a Firebase bill.
The baseline JSON does not record its Node version; elapsed comparisons are not
presented as a controlled cross-runtime benchmark.

| Command/check | Observed result | Evidence |
| --- | --- | --- |
| `npm ci` | Exit 0 | `npm-ci.txt` |
| `npm run lint:ratchet` / `npm run test:no-skips` | Exit 0 / exit 0 | `lint.txt`, `no-skips.txt` |
| Browser runtime, owned-process and sandbox unit tests | 3 suites / 29 tests passed | `browser-unit.txt` |
| `npm run release:check` | Exit 0; existing v2.8.6 / 75 assets, no metadata/version change | `release-check.txt` |
| Final `npm run test:e2e:outbox` | Exit 0; **24.729 s**, all 26 scenarios, 6 Quick Log / 6 capture / 8 durable cases, legacy PWA and both weekly cases; 26 retained journals and 26 closed servers | `positive/`, `positive.txt` |
| Final `npm run test:e2e:outbox:negative` | Verifier exit 0; real child exit 1, **26.337 s**, only deliberate `cleanup-owner`; all assertions, journal readbacks and server cleanups complete | `negative/`, `negative.txt` |

All 94 original positive assertions and all original negative-verifier assertions
remain unchanged; new assertions strengthen isolation, completeness, retained
data and cleanup. `assertion-preservation.json` records parsed assertion hashes
and the unchanged core body. All **11 protected runtime/fixture-input hashes**
equal bdab, including both app-bootstrap/environment files. Only the two runner
scripts, evidence attributes and this new evidence directory change.

The first candidate incorrectly asserted zero journal rows after app startup and
failed in 4.640 seconds when startup legitimately produced two rows. Its JSON,
screenshot and trace remain in `positive-initial-startup-assumption/`. The probe
was moved before startup; no original assertion or product code changed. The
next positive/negative pair passed at 21.028/20.207 seconds; those unmodified
intermediate runs remain under `*-before-retention-proof/`. The final pair above
adds all-origin hash readback and supersedes them as final fixture evidence.

Final app scenarios began with zero journal batches, then normally held two
startup batches and six to eight completed batches. Core ended at ten. The
product's O(backlog) journal work and lack of compaction are unchanged; this fix
removes unrelated test accumulation rather than measuring or changing that
runtime behavior. Full application coverage, hosted CI and final-stack native
acceptance are not newly executed by this fixture-only change. No service,
credential, remote branch, other worktree or published asset was changed.

Manifests use canonical Git index bytes (LF, retaining BOM), cover only tracked
artifacts and exclude their own self-reference. PNG files are binary; text logs
retain their actual messages without trailing padding.
