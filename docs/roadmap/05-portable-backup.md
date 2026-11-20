# 5. Portable workout-history backup

Status: planned feature. Baseline: v2.8.3 / `d4c6d0d`. Follow objective 2's owner/completeness rules and the
[shared verification and review protocol](README.md). Restoration implementation is a future separate reviewed step.

## Scope and invariants

Export the signed-in user's persisted `sesiones_entrenamiento`, `routines` and
`app_data/user_preferences` into a downloadable versioned JSON file. Routine clipboard sharing/import already
exists and does not restore history. Neither a history page, the 300-session Progress cache nor the 1,500-session
Daily Hub window is a complete backup source. Do not export auth storage, credentials, tokens or another UID's records.

Retain document IDs, exact numeric values, dates, execution/load variants, raw compatibility aliases and unknown
document fields. Existing model normalizers intentionally project fields and must not be used as a lossy export
pipeline. Missing preferences must remain distinguishable from stored default values.

## Ordered implementation

1. Specify envelope `format`, integer `schemaVersion`, app/release version, export time, owner scope, per-collection
   source/counts/completeness and record IDs plus raw data. Define a reversible JSON codec for Firestore Timestamp
   seconds/nanoseconds and any other supported stored types. Preserve number/string/null/missing distinctions,
   decimals and aliases; reject unsupported/nonfinite values with a path-specific error, never silently round/drop.
2. Create a dedicated export repository/service. Capture UID/auth generation for the full operation; abort on
   sign-out/account change. Online full export pages each collection using a stable unique cursor such as document
   ID until true exhaustion, independently of UI query caps and equal training dates. Read the preference document
   explicitly. Record pages, source, failures and total counts; cancel/retry without producing a falsely complete file.
3. Define completeness honestly under concurrent writes. Compare full enumeration manifests/record hashes across
   verification passes; if data changes, retry within a stated bound or label the result incomplete/changed during
   export. Explain that this is an observed stable enumeration, not an atomic cross-collection snapshot. Mark
   complete only when all sources reached EOF, fidelity/count checks match and no unresolved fetch/consistency
   error remains. Never infer completeness from a short local page or a query returning its cap.
4. Add accessible ES/EN export UI with full-cloud versus locally available data, per-collection counts, data-as-of
   time, progress/cancel/error states and a final completeness summary before download. Offline export uses only
   the current UID's known data and is explicitly **local-only/incomplete**, including missing routines/preferences.
   Pending unsent mutations are identified separately and cannot masquerade as persisted server records.
5. Validate the output with independent fixtures and a live designated account. Include more sessions/routines
   than one export page, equal timestamps, empty collections, missing preferences, legacy aliases, bodyweight/
   external variants, high-precision decimal values and unknown fields. Compare exported IDs/counts/typed values
   with raw saved documents, not with the same serializer's output. Exercise account switch and mid-page failure.
6. Write and review the restore **design**: supported schema versions and migrations; resource/type/value/owner
   validation; unsupported-field errors; preview counts/diffs and warnings; transactional/batched failure/retry
   model; dry-run mode; and duplicate/conflict rules. Default proposal: match original session IDs for idempotent
   same-account restore, skip byte/typed-value-equivalent records, preview divergent collisions and require an
   explicit choice; never silently duplicate or overwrite. Cross-account transfer needs explicit owner remapping
   and validation, not blind reuse of `userId`. Define routine-reference and weekly frozen-outcome treatment.

## Completion criteria and evidence

| ID        | Required result                                                            | Evidence                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BACKUP-01 | Versioned format preserves exact persisted values and compatibility fields | Schema/codec documentation; independently expected JSON fixtures and parsed typed-value comparisons, including timestamp nanoseconds and decimal weights        |
| BACKUP-02 | Full online export is paginated to exhaustion and accurate                 | Multi-page/equal-date/empty/missing-pref tests, query telemetry and real-account document IDs/count/value reconciliation                                        |
| BACKUP-03 | Completeness cannot be overstated                                          | Failure/cancellation/truncation/concurrent-change tests; separate complete-cloud and local-only screenshots with collection counts and as-of information        |
| BACKUP-04 | Export contains only the captured current account's domain data            | A/B ownership tests and inspected file; auth-change abort; assertions excluding auth/local-storage credentials and foreign IDs                                  |
| BACKUP-05 | User can download/reopen the file through ES/EN keyboard-accessible UI     | Actual browser download and independent parse, empty/offline/error/cancel journeys and focus/status assertions                                                  |
| BACKUP-06 | Restore design has validation, preview and duplicate handling              | Reviewed design with worked equivalent/divergent/malformed/foreign-owner/partial-failure examples; no restore-history implementation or misleading import claim |
| BACKUP-07 | Existing app, routine sharing and release behavior remain green            | Shared gates, targeted export/routine-import/offline tests, release integrity and upgrade smoke                                                                 |

Both **independent GPT-6.1-Sol xhigh judges** must approve the same final implementation SHA and BACKUP-01
through BACKUP-07. Export fidelity and the restore design close this objective; actual restoration must receive
its own future implementation and independent two-judge review.
