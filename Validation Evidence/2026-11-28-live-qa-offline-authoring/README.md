# Offline session and mixed-week QA authoring

**LIVE NOT RUN.** This handoff authors additional acceptance tooling only. No browser/SDK account session,
Firebase/auth service, credential, deployment, push or workflow dispatch was used. Tests use explicitly
synthetic boundary fixtures and local DOM rendering; none of them supplies live SYNC-03/04 acceptance.

Base: `949c791ccc789058abe28254710c86f45326c1d0`. Worktree:
`C:/tmp/gym-live-qa-offline-sessions`, branch `codex/roadmap-live-qa-offline-sessions`.
The [manifest](source-manifest.json) records exact source and evidence hashes. Root must combine this QA
with the separately authored artifact-allocation/final-write repair and product replay-resolution fix,
review the resulting exact candidate and execute both roles against that final SHA.

## Added live contract

The phase plan grows from **47 to 60 barriers**. A frozen Git-source fixture verifies that all 47 original
phase objects and their relative ordering are retained. The new phases use the same Windows-A/Ubuntu-B
roles, real SDK/browser/SW/profile lifecycle, canonical Git-blob loopback server, project/UID guards,
credential environment, manual job guard, calendar range, frozen-week precondition and 15-minute budget.
No app, backend, policy, workflow, dependency or version change is included.

- Seven early mixed-week barriers run **before** the original different-week case can freeze X. A queues
  X=4 at the base date and Y=5 at +7 days offline, then restores its base clock before reconnecting. B
  commits X=6 online. A must retain the exact X conflict while independent Y applies/drains once. Both
  check original timestamps, immutable receipts, per-week/global revisions and preserved frozen outcomes.
  A then makes a **new offline** public X=3 press, proves the replacement durable, reconnects, and requires
  the actual persisted journal outcomes old-X=`resolved` / replacement=`accepted`. The replacement's
  descriptor-level `observedWeeklyConflictIds` must contain exactly the observed old X queue ID. The
  server conflict receipt and Y receipt/value remain unchanged. Both reload/drain at the base clock.
- Three barriers save the first normal strength capture (50.5×8) and Quick Log index 4 **offline**.
  Queue/session IDs, dates, enqueue timestamps and full payload SHA-256 metadata must be durable without
  server documents. A full browser stop/start on the same profile, with CDP offline before navigation,
  must preserve those exact entries, native IDB rows/hash, auth UID, controller and revision. Reconnect
  must create exactly those two IDs, two ordered immutable create receipts and exactly +2 session revision;
  reload cannot duplicate them. These are two records **inside** the original session manifest: the later
  online loop skips indexes 0 and 4. Four captures, 11–20 total new sessions, the single last-page sentinel,
  the three-capture/52.5 fallback and all original surface checks remain meaningful. Both roles also open
  the offline Quick Log's exact ID/detail, including its original date and unique note.
- Three barriers run after both original deletion/surface cases. Both roles reload online and warm all
  history pages, calendar, Hub, Progress/chart/table, details and suggestions. Both then cold-start offline
  on their same profiles and repeat every public surface check against that locally held, previously
  verified checkpoint. The helper cannot fetch a REST product snapshot in its offline branch. Deleted
  IDs remain absent; three strength records and 52.5/8 remain visible. Both return online, reload and
  reconcile with the real server again before cleanup.
- The existing final `both-baseline-records-preserved` phase now reloads **both actual UIs**: all history IDs
  and Hub/calendar counts must equal the complete previous baseline, the UUID-specific Progress exercise
  must be absent, and a fresh public capture must show no saved suggestion. Zero means zero run-owned
  records; existing baseline records are preserved. Genuine empty history is distinguished from an error
  or unavailable-cache message, in ES and EN.

Cold offline network evidence counts attempted Firestore requests, noncached Firestore responses, cached
responses and all failed transport events. Failed SDK attempts are allowed; a real Firestore response during
that owned browser window fails. No URL/query, header, payload or CDP request ID is retained. Node coordination
remains online; it does not provide the browser's cached UI data. This is not a claim of zero SDK attempts,
nor a forced lost-ACK/atomic-ACK crash-injection test.

## Dependency and calendar limits

The default calendar argument is deliberately unchanged. Root reports the November-27 week was legitimately
frozen by the prior 47-phase run. A future execution needs a fresh UUID and December 4→December 11, or a later
pair passing the existing unfrozen/range guards. X is resolved at the base clock before original online
advancement; no outcome, receipt, policy or session revision is reset.

Source 949c791 does not yet contain the separately authorized offline conflict-resolution runtime repair.
The new QA intentionally rejects that old behavior; it must run after the descriptor-observation/atomic ACK
fix is integrated. QA only reads existing descriptor metadata and the real persisted outbox acknowledgement
map. No runtime fix, private product mode, storage mutation shortcut or SDK transaction stub is introduced.

## Executed authoring checks

| Check | Observed result |
| --- | --- |
| Locked `npm ci --ignore-scripts` | Exit 0, 400 packages, existing audit 18 moderate; no lock/dependency change |
| Focused QA + existing owned-browser/runtime/sandbox suites | [Pass](focused.txt); final counts in the manifest |
| ESLint 10 `lint:ratchet` | [Pass](lint.txt), zero warnings |
| No skipped tests | [Pass](no-skips.txt) |
| `release:check` | [Pass](release.txt): current v2.8.6, 75 cached assets, temporary two-build verification; no working-copy bump |
| Syntax, immutable guard/source checks, negative CLI | [Authoring checks](static-checks.json); no credentials/services |

New tests execute the actual runner helper bodies located with the existing JavaScript parser and injected
synthetic read-only boundaries; they do not maintain a second implementation. They reject wrong session
IDs/dates/payload hashes, duplicate replay/counters/receipts, cold journal/revision drift, discarded X/blocked Y,
changed frozen outcomes/timestamps/receipts, missing observed conflict IDs, accepted-X instead of resolved-X,
and any real response in an offline CDP fixture. A protected offline surface fixture throws on **any** REST
API access. Local DOM cases exercise the actual History and suggestion renderer in ES/EN. Temporary directory
tests exercise only their own generated authoring fixture; they do not launch Chrome.

Initial test-only harness failures (missing injected constant, cross-VM array prototypes and a reversed
visibility expectation) were corrected without changing product behavior. One indentation warning was fixed.
Final gates are recorded honestly above; no live pass, two-machine result, mobile/iOS/installed-PWA result or
judge approval is implied.

## Cherry-pick boundaries

`scripts/live-sync-qa.mjs` changes begin at the original `surfaces` helper (old line 259), add mid-function
helpers and switch actions, and replace the last `baseline-preserved` action body. Its imports, startup/
artifact allocation prefix, auth/preflight/phase loop and final writes/main suffix remain byte-equivalent to
949c791 after LF normalization. The manifest proves both unchanged slices. The independent allocation/final-write
repair may overlap the surrounding function context during a cherry-pick; retain that repair and these helper/
action changes. Browser helpers/scenarios/tests/docs are the remaining scoped changes. Do not take product,
workflow, policy or version files from another branch as part of this QA commit.
