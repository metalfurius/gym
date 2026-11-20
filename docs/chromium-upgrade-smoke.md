# Chromium upgrade smoke: controlled lifecycle and evidence

This is a focused objective 4 prerequisite. It repairs a test-fixture lifecycle race that blocked the existing
required Chromium gate. It does not change the application/service worker or close objective 4: dependency
maintenance, additional browser gates and actual Safari/iOS installed-PWA evidence remain open.

Main run [44733781790, attempt 1](https://github.com/metalfurius/gym/actions/runs/44733781790/attempts/1) and
the documentation PR run [44735311027](https://github.com/metalfurius/gym/actions/runs/44735311027) observed
an A document (`v2.7.0`) with only the B cache and B metadata (`v2.7.1`). A controlled diagnostic reproduced
that terminal state by reloading A while replacement activation and delayed fixture listeners raced; another
navigation recovered B. This establishes a fixture race mechanism, not a confirmed persistent product defect.
Passing a later retry does not erase the earlier failed gate.

## One observable update sequence

The smoke builds isolated A/B releases using the repository's actual worker and release-integrity generator.
The fixture's initial bootstrap installs its listeners and registers A. The harness waits for initialized
listeners, an activated A and an A-controlled page before storing the exact workout and changing the server.
The first A claim updates mutable controller state without reloading.

The harness requests B, then waits for an actually installed waiting worker while A still controls the A
document. The fixture exposes an accessible update message and an Apply button. After capturing that UI, the
harness sends a trusted pointer click. Only that action backs up the workout and sends `SKIP_WAITING`. One
`controllerchange` handler reloads once; there is no fallback reload timer. Cache existence never establishes
installation readiness, and no CDP reload occurs before the B update has passed its assertions.

The B barrier requires the B document, initialized new listeners and an activated controlling worker. Assertions
compare the entire session string and restored field with the original, the full served target manifest, the
Progress hash, update messaging, the exact backup, one trusted Apply click, one update reload and removal of A's
cache. Only afterward does an explicit CDP reload exercise offline restart. The same exact session/release/hash
checks run offline and after reconnect. No additional recovery reload can make a mixed A/B update pass.

## Reproducible execution

Run `npm run test:e2e:upgrade`. `CHROME_PATH` optionally selects the Chromium executable; otherwise supported
Windows/Linux paths are discovered. Each run creates its own temporary profile and asks Chrome for port `0`.
Only that profile's `DevToolsActivePort` is used, so concurrent reviewers cannot attach to each other's browsers
or collide on a fixed debugging port. The reviewed owned-browser helper requests graceful CDP shutdown and
uses bounded cleanup restricted to its own launcher/process group. Temporary cleanup paths are checked.

| Setting | Meaning |
| --- | --- |
| `UPGRADE_SMOKE_BOOTSTRAP_DELAY_MS` | Default `0`; `1000` deterministically delays both fixture bootstraps. Bounds: 0–10,000 ms. Readiness still depends on observed lifecycle state. |
| `UPGRADE_SMOKE_EVIDENCE_DIR` | Output directory. Default: a new timestamp/PID directory under ignored `tmp/upgrade-smoke/`. Historical July 2026 evidence is never an output default. |
| `UPGRADE_SMOKE_NEGATIVE_CASE=corrupt-session` | Corrupts only this disposable fixture's saved workout after B activation. The exact-session assertion must fail with exit 1. |

Build subprocesses have 20-second timeouts, CDP commands 10-second timeouts and readiness predicates 20-second
deadlines. A 90-second abort deadline stops further readiness waits; bounded CDP failure capture and owned
cleanup then finish. CI limits each case to three minutes. A timeout is a
failure, never a readiness substitute. CI runs the normal case and the required 1,000-ms delayed-bootstrap case
and attempts artifact upload with `if: always()`. Existing app/offline/no-skips/coverage gates remain required.

## Artifacts and negative verification

Each run writes an initial `evidence.json`; normal success/failure paths also write `trace.json`. An external
forced termination can leave the initial `running` record without a final trace, which is not a pass.
The final status becomes `passed` only after assertions
and owned cleanup finish. JSON includes checkout SHA, exact browser version, stages, console/errors, network
responses, worker events and before/update/offline/reconnect states. The trace preserves CDP navigation and
worker lifecycle events. Success includes update-available, desktop and mobile screenshots. Failure captures
`failure.png` and the latest state while CDP remains available; startup/disconnection failures explicitly retain
the error even when a screenshot cannot be taken. Current-run CI artifacts are named by SHA/run attempt.

For a local negative run, set `UPGRADE_SMOKE_NEGATIVE_CASE=corrupt-session` and a separate evidence directory,
then execute the same npm command. Require exit **1**, JSON `status: failed`, and error
`In-progress workout differs from the exact saved session`. This demonstrates that the runner still rejects a
real failed invariant rather than treating any browser termination as success. Clear that environment variable
for positive runs; it is never enabled by required positive CI cases.

Local prerequisite validation on Windows/Chrome 157 included normal and delayed cases running concurrently,
both with one trusted Apply click and one controller reload, plus the real negative exit-1 run with JSON, trace
and failure screenshot. These are fixture results. Exact-head Linux CI and both independent judges remain the
merge gate; none of these results establishes an already-installed production client or physical iOS outcome.
