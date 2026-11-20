# 7. Separate application responsibilities

Status: planned refactor. Baseline: v2.8.3 / `d4c6d0d`, to be rebased on the completed behavior from preceding
objectives. Depends on objective 2 contracts and objective 3's measured read budget. Preserve export/editor behavior
from objectives 5/6. Use the [shared checks and review protocol](README.md).

## Scope and boundaries

`js/app.js` orchestrates authentication/views but also owns Daily Hub fetching/render assembly, weekly preference
normalization/state/persistence and queue handlers. `js/utils/quick-log.js` mixes Quick Log parsing with weekly
calculations and Daily Hub state computation. Extract responsibilities without introducing a product/schema change.

Proposed boundaries (final names may follow repository conventions):

| Responsibility                   | Module boundary                                                    | Explicit inputs/outputs                                                                                               |
| -------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Quick Log parsing/model creation | `js/utils/quick-log.js`                                            | Payload + supplied date/timestamp factory -> validated session model; no fetching, preference writes or DOM           |
| Weekly consistency calculations  | `js/utils/weekly-consistency.js`                                   | Sessions, completeness, preferences and supplied clock -> timeline/metrics; no storage/network/DOM                    |
| Daily Hub repository/assembly    | `js/modules/daily-hub-manager.js` plus pure state helper if useful | UID, clock, routines, connection/queue state -> owned snapshot/state; controls objective 3 cache/deduplication budget |
| Weekly preference persistence    | `js/modules/weekly-preferences.js`                                 | UID + revisioned operation -> normalized state/result; owns cache, atomic merge and compatible queue handlers         |
| App orchestration                | `js/app.js`                                                        | Connect auth/view/mutation events to these modules and render results; no duplicated weekly algorithms                |

The final interfaces must make owner, clock, completeness, invalidation generation and side effects visible.
Avoid a generic framework or a new dependency solely to move functions.

## Ordered implementation

1. Freeze a behavioral/contract baseline after preceding objectives: exported helper signatures, legacy import
   sites, Firestore fixtures, queue descriptor fixtures (including old persisted payloads), cache keys/TTLs,
   timestamps, session/streak outputs, offline ordering and objective 3 read counts. Map imports before moving code.
2. Extract pure weekly calculations and Quick Log parsing first. Pass clocks/data explicitly. Retain compatibility
   re-exports while callers move where needed; remove them only when all production/test import sites are verified.
   Do not rename wire fields or fix unrelated product behavior in this refactor.
3. Extract preference state/persistence and queue registration with explicit initialization/lifecycle. Keep
   `preferences.saveWeeklyTarget`, `preferences.syncWeeklyState` and all existing session descriptors readable;
   preserve original logical timestamps, atomic conflict rules and exactly-once handler registration. Ensure
   module import order cannot replay a queue before the owner/auth prerequisites are ready.
4. Extract Daily Hub repository and assembly while keeping cache version/owner, TTL, deduplication, forced-refresh,
   mutation invalidation and partial-result rules intact. Keep DOM rendering at an explicit adapter/orchestrator
   boundary. Remove duplicate state stores and cyclic imports rather than hiding an `app.js` dynamic import loop.
5. Update app/view handlers to use the modules, with account/logout cleanup and mutation listeners registered
   once. Verify capture, Quick Log, deletion, export, edits, preference changes and reconnect retain the same
   ordering. Compare representative old/new wire output and queue replay traces byte-for-byte or typed-value
   equivalently where serialization ordering is irrelevant.
6. Add every imported local module to the PWA asset graph/cache manifest, regenerate release hashes with the
   repository tool and validate all static/dynamic imports. Run an old-to-new upgrade with an in-progress workout
   and an offline restart so a missed module is detected before delivery.
7. Rerun characterization/journey and deterministic read-budget scenarios on the final SHA; inspect module
   dependencies and application size/responsibilities. Record the before/after map and output comparisons.
   Report newly discovered behavior bugs separately; do not smuggle fixes into the parity refactor.

## Completion criteria and evidence

| ID     | Required result                                                                      | Evidence                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| MOD-01 | Quick Log, weekly calculations, Daily Hub and preferences have explicit modules      | Before/after responsibility/import map; app.js delegates instead of retaining copied implementations                                       |
| MOD-02 | Firestore/session/counting/aliases remain unchanged                                  | Typed raw fixture comparisons, same-day/deduplicated-session metrics and legacy-reader tests                                               |
| MOD-03 | Old/new queue descriptors replay with unchanged ownership/order/timestamps/conflicts | Persisted queue fixtures, restart/reconnect traces, single handler invocation and account-switch cases                                     |
| MOD-04 | Read ceilings and cache freshness behavior remain unchanged                          | Same objective 3 scenarios/clock/telemetry: zero added reads while fresh, bounded expiry/refresh, correct empty/offline/truncated behavior |
| MOD-05 | All cached modules install/update and load offline                                   | `release:check`, asset/import graph inspection, generated manifest diff and two-version offline upgrade evidence                           |
| MOD-06 | Product flows retain behavior with no unrelated scope                                | Shared gates and focused Quick Log/weekly/history/progress/preferences/export/editor journeys; no unexplained wire/UI differences          |

Both **independent GPT-6.1-Sol xhigh judges** must approve the identical final refactor SHA and MOD-01 through
MOD-06. Fewer lines in `app.js` alone is not acceptance; preserved contracts, actual offline loading and measured
read ceilings are required before marking this objective complete.
