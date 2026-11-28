# Objective 2 integrated verification, November 28, 2026

**Unpublished v2.8.6; final acceptance remains open.** Baseline is main
`3cf38202e5974acf97d0b2926ca365acf7019eba` (published v2.8.5). This record prepares one frozen source for full
checks, independent reviews and the extended real-account run. It does not substitute authoring fixtures or
the older real 47-phase run for final acceptance.

## Integrated corrections

| Component | Immutable author source | Scope and recorded checks |
| --- | --- | --- |
| Private QA artifact output | `8da62faf1c3609e0be938e926d240839b1d37722` | Exclusive private allocation and retained descriptors; 18 real filesystem regressions; genuine CodeQL 32/33 removed by actual analysis on integrated ancestor `991c96f` |
| Monotonic conflict metadata | `50c1aea40f9075d13ac2702b521e43be062542ac` | Known canonical week survives stale producers and cold restore; contradictory weeks fail closed; fresh owner/week resolution preconditions; 16 regressions |
| Offline explicit resolution | `8c91a2bdf5ddd56b42fe542725300f794b9f529e` | Immutable observed conflict IDs; one atomic local batch accepts the replacement and resolves only eligible observed conflicts; 13 regressions and native abort/unknown-commit recovery |
| Extended real QA driver | `3732b0ce88302d45354bc72b0ca8b00d8141d7ad` | 60 phases, all original 47 phase objects retained; authoring checks only, no actual backend execution of these additions yet |

The offline-resolution baseline reproduces a coherent server revision 6/conflict receipt 6, then an explicit
Settings change queued from base 6. Before correction its applied receipt 7 left the old conflict pending.
The [new descriptor contract](weekly-observed-conflict-resolution.md) binds only the conflicts actually observed
by that user for that week. Direct acceptance and replay share the same atomic acknowledgement path. A storage
abort or uncertain commit retains enough durable intent to recover the original receipt after a cold restart;
later conflicts and other owners/weeks are preserved. Legacy descriptors without the optional field remain readable.
No Firestore payload, server policy, journal version, dependency ordering or original timestamp was changed.

The dated component ledgers preserve earlier failures, incomplete interrupted output and corrected fixture
assumptions. Their individual test totals are component evidence, not a claimed full run of this integrated head.
Root checked all component Git blob hashes. Attribute conflicts were resolved by retaining each scoped rule;
PNG artifacts were restored from exact original blobs. The QA security test's expected phase count changed from
47 to 60; no assertion was removed. One redundant EOF blank in a console lint artifact was normalized, with its
original bytes/hash retained in the QA authoring manifest.

## Required final evidence

The new real scenarios add an offline strength capture and Quick Log, cold restart with exact IDs/dates/payloads,
exactly-once replay and both-client surface checks; a mixed-week queue where one chain conflicts while the other
progresses, followed by an offline explicit replacement; and cold offline readback after deletion. Both UIs must
also reload and agree with the final server baseline after cleanup. Real SDK/auth/Firestore, independent Windows
and Ubuntu hosts, native storage, fixed synthetic UIDs, new UUID, matching clean SHA and an unfrozen calendar pair
remain mandatory. No policies, counters, receipts or frozen outcomes may be reset for a retry.

The [historical 47-phase run](real-sync-47-2026-11-27.md) remains valid only for source `949c791`; judge B's scoped
assessment and its three coverage gaps are retained. That run and native fixtures complement the final run;
they do not close SYNC-01 through SYNC-07 or approve this source.

The actual backend was freshly read on November 28: exact separately reviewed rules source
`96c0f5bbbde95808b666c62586ad5caa507f3dfe7007c65d6d4c9f97de24c451`, 12,878 bytes; ruleset
`000a8e44-8c4a-44f2-8c77-7eb222f7aee4`. The successful actual Rules API release response reports server update
time `2026-11-27T18:02:01.679414Z`. The source remains the editor server component from `618cacce`, ahead of
main's base rules file. Its limited two-judge deployment approval does not approve an editor/frontend merge.

Root's combined QA tooling run passed 147 tests in 8 suites on integrated `875d7f8`, with lint, release integrity
and clean-source guards passing. Ancestor `991c96f` passed all 16 required hosted checks, including 1,182 tests,
82.03% statements, Linux filesystem cases and actual CodeQL. These are precisely scoped prior results. The final
integrated source still needs its own full gates and real 60-phase result, followed by two independent
**GPT-6.1-Sol xhigh** approvals of the identical frozen SHA. Run artifacts and immutable CI references must be
attached to that review record without changing source during execution.

Production publication and the retained OS-installed v2.8.5 PWA's actual update/offline/reconnect journey are
subsequent delivery evidence. A fresh November 28 cold/offline readback preserved its exact workout contents,
latest pre-update autosave timestamp and visible v2.8.5 footer/meta. Physical iOS remains a separate open quality
gate; no device result is inferred from desktop Chromium or native fixtures.
