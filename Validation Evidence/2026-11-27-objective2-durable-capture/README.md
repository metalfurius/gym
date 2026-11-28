# Durable capture identity correction

Local implementation checkpoint on H9a; not objective-2 completion or final live acceptance. The [author contract](../../docs/capture-durable-identity-review-9a.md) explains stable capture/session identity, verified dual-slot write-ahead before enqueue/RPC, strict journal reconciliation before Resume, immutable retries and healthy legacy-PWA migration.

Root verified all 11 raw source hashes in [handoff-raw.json](handoff-raw.json), their canonical LF/BOM forms in [source-manifest.json](source-manifest.json), all 11 executed native source hashes, and no changes to the nine audited journal/cache/transaction/version-manager foundations. Native result checkoutSha records the pre-commit H9a; executed source hashes identify the candidate precisely.

Final local results: 74 suites / 1,100 tests, 80.87% statement coverage (70% required), lint 10/no-skips, app 6/6 and offline 2/2, v2.8.6/75-asset two-build integrity, real Chromium native-storage positive plus real cleanup-negative child and A-to-B upgrade all passed. [Native positive](native/result.json) includes six capture cases, eight primary/mirror × ACK × warm/cold cases, pre-commit uncertainty, healthy PWA5 migration and existing journal/weekly/barrier assertions. [Negative verifier](negative/negative-verification.json) requires child exit 1, failed final evidence and completed later cleanup.

Retained failures are evidence, not passing gates: [first expanded native timeout](first-native-timeout/result.json), the cold 5-second import-hook failure in tmp-review-9a-coverage-accepted.txt and the pre-commit regression in tmp-review-9a-unknown-precommit.txt. The complete unchanged coverage rerun passed in 70.903 seconds. Native positive measured 170.6/180 seconds; CI setup/runtime margins remain open. No assertion, coverage threshold or import-hook deadline was weakened.

Console copies use LF, trim trailing console padding and redundant EOF blank lines; original raw files remain outside Git in a parent-owned handoff snapshot. JSON uses canonical Git LF and PNG files remain binary. The artifact manifest hashes tracked Git blobs only.

No real account/service, retained PWA profile, phone or two-machine result is supplied by these synthetic-SDK native checks. Historical already-consumed ID-less drafts have no provable old intent association. Final integrated source, hosted checks, actual service/device journeys and two independent approvals of an identical final SHA remain required.
