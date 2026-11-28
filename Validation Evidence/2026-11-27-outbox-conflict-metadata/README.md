# Canonical conflict metadata follow-up

Base: 949c791ccc789058abe28254710c86f45326c1d0. Implementation and fresh checks ran in the isolated metadata worktree on November 27–28, 2026. Runtime remains the unpublished local v2.8.6 with 75 cached assets. This is a local implementation checkpoint, without publication, live acceptance, or objective closure.

## Reproduction and change

The independent judge's scenario was reproduced before changing production code. Client B retained an old conflict at revision 3 without a week. Client A learned its canonical week, 2026-11-16. B's public persistQueue then erased that week. The first test failed with expected 2026-11-16 and received undefined; the raw failure remains in baseline-reproduction.txt. The exact legacy payload timestamp, 2026-11-22T23:30:00.000Z, falls in week 2026-11-23 under Europe/Paris, so replacing the canonical context with a local date inference changes resolution eligibility.

The production delta is confined to outbox-order.js, durable-outbox.js and offline-manager.js. One pure merge keeps the highest valid conflict revision and any known canonical week, independently of row/UUID order. Restore, RAM refresh, proposed conflict events and both conflict-producing paths share that merge. A newer producer without week metadata cannot downgrade known context. Two different known canonical weeks for the same immutable intent reject with outbox/integrity. Intent identity, descriptor/payload, timestamps, causal ordering, semantic dependencies and accepted/resolved tombstones retain their existing contracts. There is no new persistent schema, protocol, Firestore path or backend change.

resolveConflicts reads durable state before choosing IDs. Its pending resolved ACK also carries an ephemeral owner/week criterion. DurableOutbox.save checks that criterion against its own fresh read, so metadata learned after selection and before this read can prevent a wrong-week ACK. Rejection preserves unrelated staged work and refreshes the caller. The criterion is removed before journal persistence. This fresh local read is the bounded validation point; this change does not promise global serialization against metadata another tab learns after that point.

The 16 new tests cover the original public persist path, both merge directions, higher revisions without a week, cold restore, reversed journal-row lexical order, stale append suppression, same-batch and persisted contradictory canonical weeks, terminal ACK preservation, owner/week separation and a controlled selection-to-save interleaving. That interleaving proves no wrong ACK and no loss of unrelated staged work.

## Fresh checks

All commands below completed on the candidate runtime bytes recorded by source-manifest.json. Browser runs followed the isolated Jest/coverage run. checkoutSha in the raw native JSON correctly records the base checkout while the candidate was uncommitted; the per-file source hashes bind those observations to the committed runtime bytes.

| Check | Result | Raw evidence |
| --- | --- | --- |
| npm ci | PASS | npm-ci.txt |
| release:write; release:check | PASS, v2.8.6 / 75 assets, no bump | release-write.txt; release-check.txt |
| lint:ratchet; test:no-skips | PASS | lint.txt; no-skips.txt |
| Focused outbox/metadata suites | PASS, 90 tests / 5 suites | focused.txt |
| test:coverage:gate | PASS, 1180 tests / 79 suites; statements 82.19%, required 70% | coverage.txt; coverage-summary.json; full-junit.xml |
| test:app:only | PASS, 6 / 6 | app.txt |
| test:app:offline | PASS, 2 / 2 | offline.txt |
| Unchanged native outbox runner | PASS, 26 scenarios, 20.458 s, cleanup empty | outbox-positive/result.json; outbox-positive.txt |
| Unchanged real cleanup-negative verifier | PASS, all 26 scenarios and retained journals, 23.544 s; child failed only at injected owner cleanup | outbox-negative/negative-verification.json; outbox-negative.txt |
| Native upgrade | PASS | upgrade/evidence.json; upgrade.txt |
| Original legacy Settings online recipe | PASS, original assertions retained | native-legacy-original/result.json; legacy-recipe-adaptation.json |
| New canonical metadata + Settings online | PASS, Chrome 158.0.8127.36, same-profile native IndexedDB tabs, cleanup empty | native-metadata/result.json |

The two metadata/native recipes use actual application handlers and actual browser storage with a synthetic Firebase SDK. The Settings helper sets the select value and invokes the actual button's DOM click. These are not live Firestore, cross-device, physical phone, visual-layout or human hit-testing acceptance claims. The native runtime proof verifies the protected capture/session-manager, app, local cache, journal storage and fixture sources are unchanged from the base; only the three listed runtime utilities differ. Existing QA scripts and historical evidence directories are unchanged.

The interrupted lint attempt failed on strict nullable comparisons; lint-before-strict-comparisons.txt is retained. focused-interrupted-empty.txt is the original empty interrupted output and supplies no test evidence. The successful fresh logs are separate. native-first-command-exits.json preserves the first native metadata failure instead of rewriting it as a pass.

## Separate open replay observation

The first native metadata attempt also tried an offline replacement followed by replay. It failed because the replacement was accepted but the old conflict had no resolved ACK. Its exact source, log, trace, result and screenshot remain under native-metadata-first-attempt.mjs.txt, native-metadata-first-attempt.txt and native-metadata-first-attempt/. The later instrumented diagnostic is native-metadata-offline-replay-diagnostic/result.json, run a70130cc-534b-4859-96f1-fec852024422: failed, process exit 1, cleanup empty. This failure is not a passing negative gate and is not fixed here.

In that diagnostic, legacy-target retains canonical week 2026-11-16 and injected conflict revision 6. The current synthetic server has only scalar target 3 and no week record. An actual offline Settings save of 5 creates queue ID native-ui-resolution and operation ID target-274984d3-d294-40fc-8669-ac272b89714a, baseRevision 0, baseOperationId null, baseFingerprint absent, semanticDependencyIds empty, with original intent time 2026-11-20T12:00:00.000Z. After reconnect it has accepted ACK and an applied revision-1 receipt at users/metadata-owner/app_data/user_preferences/weekly_operations/target-274984d3-d294-40fc-8669-ac272b89714a. The preferences target is 5, yet legacy-target remains conflict revision 6 / canonical week 2026-11-16. Other-owner and other-week conflicts remain too, as intended.

The injected conflict revision 6 does not correspond to the absent server week/base 0. This diagnostic identifies the application path missing resolution, but does not establish a coherent revision-6 conflict history. Root confirmed by code inspection that direct online saving invokes conflict resolution and replay currently does not. A separate follow-up must first reproduce a coherent server week revision 6 and matching conflict receipt before changing replay semantics. This checkpoint deliberately leaves app.js and replay semantics unchanged. The receipt-filter-incomplete/ and online-before-receipt-capture/ captures are retained because their first receipt predicate omitted the app_data/user_preferences path; the final captures correct instrumentation only.

The paired real 47-scenario Windows/Ubuntu run belongs to exact base 949c791, as reported by root, and is historical evidence for that source. It is not acceptance of this metadata candidate. CI, independent exact-head reviews, integration and any live rerun remain with root. No credentials, account operations, production writes, external services, push or merge were performed here.

## Integrity

source-manifest.json hashes canonical Git-index buffers, preserving any UTF-8 BOM and using Git LF text bytes. It includes every release asset, selected protected runtime/QA/config sources and the new regression test. artifact-manifest.json includes only tracked files in this new evidence directory, excluding the two generated manifests and verification-summary.json. The verifier checks those generated files separately. PNG files are binary (-text); text evidence is LF. verify-evidence.mjs checks the manifests, the unchanged protected source set, native runtime hashes and all 75 release asset hashes. No historical evidence is rewritten. text-normalization.json records the before/after canonical hashes for removing coverage formatter right padding and lint EOF blank lines; assertions, errors and results are unchanged. Exact failed native captures are untouched.
