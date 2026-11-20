# 6. Correct saved workouts without recreating them

Status: planned feature; **depends on objective 2** account, mutation and conflict foundations. Baseline:
v2.8.3 / `d4c6d0d`. Use the [shared checks and review protocol](README.md).

## Scope and protected fields

History currently supports details and deletion. Add an editor for saved label, notes, weights, whole repetitions
and recorded durations. Firestore document ID, `sessionId`, owner, routine identity and original training date
are immutable. Editing never creates another session, moves weeks, changes a routine definition or silently
recomputes a frozen historical outcome. Suggestions/statistics already exist; refresh them rather than rebuilding them.

Start from the raw saved document, not a projected app model: preserve unknown fields, legacy aliases, execution/
load variants, target context and nested set data. The current cardio UI primarily captures notes and a routine
`objetivoDuracion`; it does not establish a separate measured-duration field. Inventory raw/legacy duration fields
and document measured-versus-goal semantics before enabling that input. A goal must never be silently edited as a measurement.

## Ordered implementation

1. Specify allowed paths and validation against current capture rules. Reuse decimal/comma/dot, signed bodyweight
   load, whole-rep and text handling. Define a compatible optional recorded-duration representation, units/ranges
   and parsing for legacy values where needed; preserve existing goals verbatim. Retain malformed untouched legacy
   fields for inspection; require correction only for edited invalid values, with field-specific ES/EN errors.
2. Add a focused history detail/editor flow with immutable date/identity context, load/error/pending/conflict
   states, cancel/discard, keyboard focus return and announced validation. Open from the selected raw session;
   guard account changes and stale detail requests. Do not mutate the saved object while typing.
3. Represent changes as validated allowed-path patches over a preserved raw baseline. Use an online atomic
   compare/merge/write, with base revision/fingerprint and immutable operation ID. Re-read the current document
   in the transaction; reject a changed base or deleted record rather than blind last-write-wins. Apply only
   intended fields to the current raw document; keep unknown/alias/variant fields intact and synchronize an
   edited alias only under the explicitly documented compatibility mapping.
4. Make edits durable offline: persist owner/session/base/patch/operation metadata before acknowledging queued
   success; render a marked local overlay; restore it after reload. Replay in session order, idempotently, using
   the same atomic conflict checks. Compose successive same-device pending edits against a known base or chain
   revisions explicitly. A failed queue-storage write cannot display a durable-success state.
5. Define and implement conflict UX before enabling offline/concurrent saves. If another device changed the
   baseline, retain the local draft and show current/local differences. User resolution creates a fresh patch
   against the current version; never silently drop either intent. If remotely deleted, show deletion and allow
   draft inspection/copy without recreating it. Retry/duplicate operation IDs must not apply twice; cross-user
   queue entries cannot write under the currently signed-in account.
6. Reuse objective 2 notifications and objective 3 snapshot invalidation for acknowledged edits and replay.
   Update history list/detail, Progress selectors/charts/stats, calendar/Daily Hub, exercise cache and previous-workout
   suggestions. Counts and weekly membership remain unchanged; refresh labels/values and read only within the
   established budget. Remove overlays only after server acknowledgement or explicit user discard.
7. Run a real-account two-device edit/offline/reconnect/reload sequence and browser keyboard journeys in ES/EN.
   Compare raw documents before/after and all displayed surfaces, including a legacy/unknown-field session,
   decimal and bodyweight variants, cardio duration, concurrent update and remote deletion.

## Completion criteria and evidence

| ID      | Required result                                                              | Evidence                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| EDIT-01 | All requested editable values validate; session identity/date stay unchanged | Allowed-path contract; invalid decimal/fractional-rep/duration cases; before/after raw ID/date comparison and unchanged session count       |
| EDIT-02 | Raw unknown/legacy/variant fields and goal context survive                   | Deep preservation fixtures at session/exercise/set levels; measured-duration versus goal examples; untouched malformed legacy data retained |
| EDIT-03 | Online/offline edits survive reload/reconnect exactly once                   | Queue persistence failure/success tests, restart/retry/duplicate replay, acknowledgement ordering and actual browser reload run             |
| EDIT-04 | Concurrent edit/delete causes explicit resolvable conflict without lost data | Atomic race tests and real two-device report; both drafts/server values inspected; deleted session never recreated                          |
| EDIT-05 | All dependent surfaces refresh consistently without duplicate sessions       | Real app integration journey and exact labels/weights/reps/durations/metrics/counts before/after; objective 3 read-ceiling comparison       |
| EDIT-06 | ES/EN editor and validation work by keyboard                                 | Focus/escape/cancel/error association/status assertions plus observed browser journey in both languages                                     |
| EDIT-07 | Existing capture, compatibility, offline and release behavior stay green     | Shared gates, numeric/variant/history/progress/offline regressions, release integrity and two-version upgrade smoke                         |

Do not ship an online-only editor while claiming this objective complete, or defer conflict behavior after
enabling queued edits. Both **independent GPT-6.1-Sol xhigh judges** must approve the identical final SHA and
EDIT-01 through EDIT-07, including executed account/device evidence.
