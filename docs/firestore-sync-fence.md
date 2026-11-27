# Firestore synchronization fence prerequisite

This is a separately reviewed prerequisite of [objective 2](roadmap/02-history-progress-sync.md).
It does not close that objective, deploy the new frontend, migrate all accounts or replace the final
two-client Firebase evidence. The new frontend must also fix the reviewed ownership, durable-cache,
legacy-baseline and conflict defects before its own final reviews.

## Why a backend change is necessary

The published v2.8.4 writer merges preferences without incrementing a revision and changes sessions
without updating a session counter. Client-only revision comparisons cannot detect all those writes.
After a verified per-account activation, the backend must reject that older write protocol so a
bounded session query and a later transaction can safely compare the same revision. This is a
compatibility barrier for acknowledged writes, not a security boundary between clients of one owner.

## Deployment and activation contract

1. Review the exact rules/test commit with both independent GPT-6.1-Sol xhigh judges. Run the emulator,
   common repository gates and hosted checks. Merge through the normal required checks.
2. Save the currently released rules and release identifier, then deploy only the reviewed
   `firestore.rules` to project `gymm-178fb`, database `(default)`, through an authorized administrator.
   Read back the release and exact source hash. Do not deploy indexes, billing changes or other services.
3. Only after that verified deployment, the administrator creates `runtime_config/sync_protocol`
   with exactly `{version: 1, epoch: 'gym-sync-v1-2026-11'}`. Clients cannot write this document.
   Its absence is a fail-closed signal for the new frontend's finalization. Allow rules propagation;
   a console success alone does not prove enforcement from a client.
4. The updated client obtains that global document from the server and, in an owned transaction,
   reads `users/UID/app_data/sync_protocol` and `session_revision`. If no UID policy exists, it
   creates the identical `{version, epoch}` policy and initializes the counter to its existing
   nonnegative integer revision (or zero), with `lastSessionId: null`, in that same transaction.
5. The policy cannot be updated or deleted by clients. Its existence fences writes even if an
   administrator later removes or changes the global document. The frontend may render cached
   data without a current proof, but must never finalize historical outcomes from it.

Unenrolled v2.8.4 accounts retain the existing owner-only session/preferences/routine contract. An
enrolled account's old client receives a permission error for a legacy session/target write; it must
update before those writes can be acknowledged. Existing read access and unrelated owned records
remain available. The new frontend must retain failed owned work and explain the update requirement.
The new counter and policy paths are reserved protocol metadata, not unrestricted preference data.

## Protected writes

| Document                                         | Requirement after UID activation                                                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sesiones_entrenamiento/ID`                      | Create, actual edit or delete must atomically advance `app_data/session_revision.revision` by one and set `lastSessionId` to that same ID.                                                      |
| `app_data/session_revision`                      | A normal increment must accompany a real change of the named session. No reset, deletion, standalone increment or two-session batch using one counter.                                          |
| `app_data/user_preferences`                      | Create/update requires schema 3 and exactly the next integer `preferencesRevision`; deletion is denied. The frontend still performs semantic-base conflict checks and preserves unknown fields. |
| `app_data/user_preferences/weekly_operations/ID` | Owner may create an immutable receipt; no client update or deletion.                                                                                                                            |
| `app_data/sync_protocol`                         | One valid activation only; no client update, deletion or writable descendants.                                                                                                                  |

A create that finds its session already present, or a delete that finds it absent, remains a
client operation without rewriting the counter, recording an immutable no-change witness where needed. A future saved-session editor uses the
same real-change/counter rule. Session contents are not projected or normalized by these rules,
so legacy/unknown data is retained. Whole-owner reads, routine writes and unrelated nested records
keep their previous ownership rules. The broad write match explicitly excludes both protected
collections; an overlapping permissive rule must never reopen these paths.

The frontend queries sessions only after activation, records the verified epoch with its read,
and rechecks that epoch plus the counter inside outcome finalization. A query started before
activation cannot be promoted into an authoritative snapshot. An older writer that arrives
before activation is included by that later query; one that arrives after activation is rejected.

Session creation/deletion also writes an immutable witness at
`users/UID/session_mutations/SESSION/receipts/KIND`, where KIND is `create` or
`delete`. Its exact fields are `{sessionId, kind, changed, revision}`. A real
create/delete requires that receipt, the session change and counter increment in
one commit. A prior create receipt or delete tombstone prevents a later creation
of the same ID, including replay after a lost acknowledgement and deletion.

A legacy session already present may receive a `create` receipt with
`changed: false`, without changing its data or counter. Deleting an absent ID
writes a `delete` tombstone with `changed: false` and the unchanged revision; this
also blocks an older creation that is still queued. Receipts cannot be updated,
deleted or bypassed through parent/descendant writes. Cache recovery uses these
immutable witnesses rather than assuming that document presence or absence proves
an old request finished. Objective 6 must define per-edit retry receipts.

## Repeatable validation

Use maintained Node 22 (22.23.5+) or Node 24+, and Java 21, with no production login:

```sh
npm ci --ignore-scripts --prefix tests/firestore
npm --prefix tests/firestore test
```

The isolated test package pins Firebase SDK 11.6.1 to exercise the application's deployed SDK
generation, its compatible rules-testing library, and the CLI. It does not change the application's
runtime dependencies. The test project is explicitly `demo-gym-sync`, the emulator binds loopback,
and the test rejects a non-loopback emulator endpoint. Actual allow/deny assertions run in the
Firestore rules engine, including legacy compatibility, cross-owner denial, atomic opt-in,
matching create/edit/delete counters, forbidden resets/bypasses, old preference merges and
permanent fencing after the global attestation disappears. No mock rules evaluator substitutes
for the emulator.

The required command uses a strict Node test reporter. Actual runner summary events
must report a successful nonempty run with zero failed, cancelled, skipped or TODO
tests. An independent child-CLI regression proves that real skips/TODOs/failures
return nonzero and a real passing case returns zero.

The isolated Node test runtime overrides `@grpc/grpc-js` to 1.14.7 because the SDK's
older `~1.9` dependency includes two reported high-severity advisories. This changes
only the Node test transport, not the browser's Firebase SDK or production assets.
The allow/deny suite must pass using that resolved transport; do not apply the audit
tool's suggested downgrade to Firebase 9 or to an older CLI. Remaining CLI-only
transitive findings are recorded separately and are not represented as resolved.

The [preparation ledger](../Validation%20Evidence/2026-11-20-firestore-fence/preparation.json)
records exact source hashes, the 16-case run, the previous server release backup and
the remaining audit scope. Its moderate findings come from CLI transitive
OpenTelemetry baggage handling, glob/minimatch traversal and UUID buffer APIs.
This command runs a demo emulator with fixed local test paths; it does not invoke
Pub/Sub, archive deployment or caller-supplied UUID buffer APIs. These limitations
reduce exposure without fixing the dependencies. Broader maintenance remains open.

[`firestore-rules.yml`](../.github/workflows/firestore-rules.yml) runs the same command for every PR
and main push. Its new check must be registered in branch protection after successful execution;
the workflow file alone does not configure repository rules. Production deployment and final live
negative legacy-write tests are separate acceptance evidence. Neither has run for this candidate.

Rule document lookups consume Firestore rule-evaluation reads, including denied writes. Client
read telemetry does not include those billed checks. Each protected mutation handles one session
per transaction and must stay within Firestore's rule lookup limits.

## Recovery and evidence

Do not roll back to permissive pre-fence rules after any account activates: that would silently
invalidate its guarantee. A recovery ruleset must retain owner checks, immutable UID policies and
the session/preferences barriers; repair the new writer or temporarily reject affected writes.
Never remove an activated policy to make an old client write succeed.

The live ledger must identify the exact reviewed source SHA/hash, previous/new release IDs,
deployment/propagation times and only designated synthetic UIDs. On an enrolled test account,
prove that actual old-style creates/edits/deletes/target merges are denied without changing server
documents, that matching new writes succeed, and that a second unactivated test account still
supports the published writer. Compare exact documents/counters before and after; a checklist,
successful upload or pair of updated clients alone does not prove the legacy barrier.

Primary references: [atomic rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions),
[overlapping rules](https://firebase.google.com/docs/firestore/security/rules-structure),
[emulator testing](https://firebase.google.com/docs/firestore/security/test-rules-emulator) and
[rules deployment and propagation](https://firebase.google.com/docs/rules/manage-deploy).
