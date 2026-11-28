# Offline resolution of observed weekly conflicts

Base: 50c1aea40f9075d13ac2702b521e43be062542ac, the separate canonical-metadata P2 checkpoint. This follow-up changes only app.js and offline-manager.js in production, plus their generated release hashes. Runtime remains unpublished local v2.8.6 with 75 assets. No backend, rules, package, shared QA script or other worktree is changed. This checkpoint supplies local evidence; exact-head review, integration and live acceptance remain with root.

## Coherent pre-fix reproduction

baseline-unit.txt and baseline-native/result.json fail before production edits. The native run af7a94cc-b409-4e88-8539-de16bdb8696f uses the actual app in Chromium and six real Settings handlers against the synthetic SDK. They produce week 2026-11-16 at revision 6. A target intent captured at revision 5 is replayed and obtains a real conflict receipt from the application transaction code with currentRevision 6. An explicit offline Settings save then captures baseRevision 6, is accepted on reconnect as revision 7 and receives its accepted local ACK, while old-conflict remains without a resolved ACK. Both failing runs and their source snapshots are retained. reproduction-sequence.json contains the exact IDs, original timestamps, week records and receipts copied from the native result.

The replacement legitimately depends on acknowledged seed-5, the operation that established its server base, and has no semantic dependency on old-conflict. The first native probe incorrectly asserted that all semantic dependencies were empty; its early-dependency-assertion source/result/log remain, and it is not counted as the product reproduction. The corrected probe fails at the unresolved-old-conflict assertion after proving receipt revision 7. Unlike the earlier P2 diagnostic with an injected conflict revision and absent server week, this reproduction has a coherent revision-6 server/conflict history.

## Implementation and durable contract

New Settings saves capture a fresh verified array of same-owner/same-week conflict and blocked queue IDs, then persist it as optional immutable descriptor.observedWeeklyConflictIds. Queueing JSON-copies this metadata. It is absent from the server payload, preferences document and remote receipts; it adds no semantic dependency and does not change journal schema 3. Legacy descriptors without the field represent an empty observation set and remain unchanged.

The shared acknowledgeOperation path handles both direct online acceptance and replay. It refreshes durable state, stages resolved ACKs only for captured IDs still eligible for that owner/week, then commits them with the replacement's accepted ACK in one authoritative journal batch. Later conflicts, other owners and other weeks are left alone. Existing accepted/resolved tombstones stay terminal. Fresh owner/week criteria from the preceding P2 fix still guard the final local save. Conflicting known canonical weeks fail closed. The validation point is local; it does not promise serialization against metadata another tab learns afterward.

A failed pre-ACK read or append propagates for new weekly descriptors and leaves the replacement and its observation list durable. After a cold reopen, an already-applied revision-7 receipt permits idempotent replay and a combined ACK retry without revision 8. A transaction abort commits neither ACK; completion ambiguity can be resolved by reading the journal, where both ACKs committed together. Advisory refresh/observer failures after a verified commit receipt retain success. docs/weekly-observed-conflict-resolution.md documents the interface and what the future MOD7 extraction and typed parity corpus must preserve.

## Fresh gates

| Check | Result | Evidence |
| --- | --- | --- |
| npm ci | PASS | npm-ci.txt |
| Focused queue/weekly suites | PASS, 103 tests / 6 suites, including 13 new tests | focused.txt |
| Full coverage gate, browsers isolated | PASS first full run, 1193 tests / 80 suites, 92.292 s; statements 82.29%, required 70% | coverage.txt; coverage-summary.json; full-junit.xml |
| App and offline journeys | PASS, 6 / 6 and 2 / 2 | app.txt; offline.txt |
| Lint / no skipped tests | PASS | lint.txt; no-skips.txt |
| Release write/check | PASS, v2.8.6 / 75 assets, no version bump | release-write.txt; release-check.txt |
| Native coherent offline replay | PASS, observed old conflict resolved and replacement accepted in one batch; repeat replay adds no SDK transaction | native-replay/result.json |
| Native put success then actual IndexedDB transaction abort | PASS, neither ACK persisted, both IDs survive cold reopen, receipt-7 retry commits both ACKs | native-ack-abort/result.json |
| Native commit completion unknown | PASS, both ACKs found together after a cold reopen, no new weekly revision | native-completion-unknown/result.json |
| New real cleanup-negative verifier | PASS, assertions complete; child exit 1/status failed only after injected owner-close error following actual cleanup | native-cleanup-negative-verifier/negative-verification.json |
| Unchanged shared outbox runner | PASS, 26 scenarios, 44.157 s, cleanup empty | outbox-positive/result.json |
| Unchanged shared cleanup-negative runner | PASS, 26 scenarios and retained journals, 46.259 s; child exit 1 at intentional owner cleanup | outbox-negative/negative-verification.json |
| Original legacy online Settings recipe | PASS, original assertions retained | native-legacy-original/result.json; native-legacy-original/recipe-adaptation.json |
| Native upgrade | PASS | upgrade/evidence.json |

The new unit cases also cover copied snapshots, blocked children, active-owner/ABA binding, same-week conflicts arriving after capture, unrelated owners/weeks, changed fresh canonical eligibility, malformed optional metadata, legacy field absence, permanent terminal ACKs, a canonical fork after RPC acceptance and refresh/listener failures after local commit. The native cases use Chrome 158.0.8127.36, actual app handlers and native localStorage/IndexedDB in an owned profile. The Settings action sets the select and invokes the real button's DOM click. Cold cases close the producer app tab, load a new module realm with the same profile/journal and retained synthetic backend, verify offline state, then reconnect. They do not claim physical-device, visual-layout, human hit-testing, live Firestore or fully network-disconnected PWA bootstrap acceptance.

All native result hashes match the candidate runtime buffers. New runner hashes also bind the final native recipes. Raw checkoutSha remains the actual base checkout while the candidate was uncommitted; it is not presented as a tested final commit SHA. Source and artifact manifests bind the committed bytes. The two changed runtime files are the complete production delta from base; the authoritative journal, causal DAG, capture/routine fixes and all other release assets remain byte-identical. No smoke assertion, timeout or 26-scenario scope was reduced. The inherited local O(backlog) journal/no-compaction limitation remains; recorded timings are observations, not an SLA or Firestore billing measurement.

## Preserved intermediate results and limits

focused-expanded-first.txt records three fixture failures caused by accidentally reusing one operation ID for distinct queue IDs in another week. The existing immutable-identity guard correctly rejected them. The fixture was given distinct operation IDs; production identity checks were not relaxed. native-replay-initial-owner-fixture-failure/ records a foreign startup routines.fetch intent that invalidated an assertion that the entire journal was empty. The final fixture establishes its intended owner before importing the app; the same assertion remains. Owner separation is independently asserted by unit tests and the unchanged shared scenarios.

lint-first.txt records two missing braces in new test/recipe multiline conditionals. They were fixed without changing assertions. Successful pre-brace native captures and the earlier negative-verifier capture are retained under explicit before-* names. Final native captures were rerun with the final recipe hash. The negative verifier creates its own output directory atomically before writing its verification/log files, while the child independently creates its exclusive evidence directory. It never overwrites an existing result or declares the child passed before cleanup.

The paired real Windows/Ubuntu 47-scenario evidence for 949c791 and the separate P2 50c1aea ledger remain historical and unchanged. They are not acceptance of this follow-up. These new remote-operation checks use the repository's transaction-capable SDK mock; they supplement, and do not replace, root's live backend/rules and independent-client validation. No real accounts, credentials, services, deployment, push or merge were used. The broader roadmap objective is not declared complete.

## Integrity and replay

verify-evidence.mjs verifies canonical Git-index buffers with LF text and any UTF-8 BOM retained, all 75 release asset hashes, the protected runtime/QA source set, the pre-fix runtime against base, and final native source/recipe hashes. Its manifests contain tracked artifacts only. Generated manifests and verification-summary.json are checked separately to avoid self-reference. PNG files are -text. text-normalization.json records only formatter right-padding/EOF normalization of new logs; preserved source snapshots and historical directories are untouched.

For reruns, create a new evidence root and set WEEKLY_RESOLUTION_EVIDENCE_DIR to it; recorded evidence is never overwritten. Run the new native recipe with no flags, --ack-abort or --ack-unknown. verify-native-negative.mjs runs the deliberate cleanup failure and requires its failed child evidence, trace and completed assertions. The original-recipe launcher accepts the same evidence root. The shared outbox/negative/upgrade commands remain independently runnable with their existing evidence-destination environment variables.
