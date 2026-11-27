# Durable outbox journal V3

This is an unpublished objective 2 correction on base
`62b71bdf8831b1d5140c2f6103aceca370ad4d7e`. It does not close SYNC-01–07, prove
the deployed backend, or replace the final two independent reviews. The
[local evidence](../Validation%20Evidence/2026-11-27-objective2-journal-v3/README.md)
distinguishes native browser storage from the synthetic Firebase SDK fixture.

## Atomic authority

`DurableOutbox.save(entries, acknowledgements)` calculates only new intent,
conflict and terminal-receipt deltas. One persistence call appends one new entry
under `offline:journal:v3:batch:<crypto ID>`:

```js
{
  key: 'offline:journal:v3:batch:<batchId>',
  value: { version: 3, batchId, eventsJson: '[...]' },
  metadata: { source: 'outbox-journal' },
  updatedAt,
  cacheInvalidations
}
```

`eventsJson` is encoded before opening the write transaction. Descriptors remain
opaque JSON, including unknown keys and the typed wire strings `'-0'`, `'NaN'`,
64-bit integer strings and nanosecond timestamps. A producer must encode typed
values before queueing; the journal does not turn raw JS `NaN` or `-0` into a
portable codec. No backup/editor module is imported here.

When IndexedDB capability is expected, a single native read-write transaction
uses `add` for that immutable entry. A successful request alone is insufficient:
only terminal `tx.complete` with a successful request returns a commit receipt.
`tx.abort` proves no batch committed, including an abort after request success.
A prevented request error followed by transaction completion is a failure when
that request did not add the batch. Early error events alone do not prove abort.
Expected but unavailable/temporarily failing IndexedDB cannot fall back to LS.

Only after IDB completion may the LS advisory mirror be written. A failed mirror
cannot revoke success, and LS-only V3 rows are ignored on an IDB-capable read.
If IndexedDB capability was absent at cache construction, one atomic native
`localStorage.setItem` is the authority. Quota failure rejects that entire batch.
This journal-specific API leaves the shared `LocalFirstCache.set`,
`getPersistedEntries`, invalidation barriers and session-receipt proof unchanged.

The commit result contains `{committed:true,batchId,committedIds,state}`. `state`
is the causal snapshot calculated before the write, including imported parent
identities. It can update RAM without relying on a fallible post-commit scan.
An older in-flight restore cannot replace a newer accepted receipt snapshot.
Subsequent refresh/mirror/observer failures are deferred work, not enqueue failure.

## Staging, RPCs and terminal receipts

`queueOperation` stages an immutable descriptor and returns its ID. It does not
persist or acknowledge it. Production callers must await `persistQueue`; replay
does so before issuing any RPC. The central descriptor-backed
`executeWithOfflineHandling` persists before online RPCs too. The app's separate
weekly save/recompute producers explicitly await persistence.

The manager serializes all persistence and rollback. A proven pre-commit failure
rolls back only that attempt's staged identities that have no durable/unknown
acceptance proof. An already scheduled persist cannot resurrect them. A cancelled
parent's identity is retained for a later atomic cancellation receipt so a child
cannot mistake it for an unrelated server-only predecessor. Unknown completion
retains the same staged ID and returns the queued state. There is no deduplication
by form content: two deliberate equal sessions still receive different IDs.

Every descriptor remains durable through its RPC. An ambiguous RPC preserves its
queue/session/operation IDs, payload, logical timestamp and original CAS base and
returns queued UX. A permanent error is returned as failure only after safe
durable cancellation. If cancellation cannot commit, the original intent stays
queued. After an accepted RPC, failure to persist its acknowledgement returns
success/pending, keeps that identity, and retries the acknowledgement before a
same-realm replay. A cold replay uses the unchanged backend receipt/idempotency
contract. Cache invalidator or success callback failures cannot report that an
accepted capture needs a new-ID retry.

Terminal events contain `{kind:'ack',id,outcome,entry?}`. `outcome` is `accepted`,
`cancelled` or `resolved`; only `accepted` authorizes a semantic child. Accepted
proof is monotonic and wins a later stale cancellation/resolution. The immutable
original entry may accompany a terminal event to retain operation-ID mapping.
If storage is evicted while a live tab still retains a verified terminal receipt,
the next batch repairs that proof before issuing a child RPC. Absence alone is
never proof of acceptance. A cold tab with a missing known parent stays blocked.

## Causal order and execution eligibility

An intent records `predecessorIds` from the known per-owner causal frontier,
including other staged intents. Reads, RAM replay, restore and weekly UI overlay
all use a topological order. Binary queue-ID order breaks ties only between
independent nodes; enqueue clocks and original user-edit timestamps never order
causal edits. Same-clock and backward-clock A → B therefore remain A → B.

`semanticDependencyIds` are separate. Payload `baseOperationId`,
`parentOperationId` and `predecessorOperationId` resolve by operation ID within the
same owner, including imported and acknowledged parents whose queue IDs differ.
A known parent must have an accepted terminal receipt before its child sends an
RPC. Failed, conflicted, unknown or cancelled parents block the chain. Merely
observing an unrelated different-week intent records causal order without making
its successful acceptance a semantic prerequisite; that week can still progress.
An operation ID never journaled locally remains an immutable remote CAS base.

Cycles, cross-owner edges, conflicting queue identities or conflicting operation
identities fail closed/quarantine. A missing explicitly recorded parent does not
become complete. UID/generation ownership, receipts, backend revision/fingerprint
checks and the original target timestamps remain unchanged. A deliberate new save
after reviewing a week's conflict clears that week's conflict/blocked chain only
after the new intent is accepted. Other owners/weeks are retained.

## Compatibility and limits

Valid V1 shared-array copies from LS and IDB contribute a union of per-owner FIFO
edges. Neither copy silently wins a contradiction; contradictory FIFO quarantines
the resulting cycle. Spanish wire fields, owner IDs and original timestamps are
preserved. Missing legacy capture IDs keep the stable queue-derived session ID.

V2 existed only in unpublished QA. Explicit operation links recover its causal
chains. Unlinked same-week records with no reliable ordering evidence stay
quarantined rather than guessing from clocks. Its old ACKs have unknown outcomes
and cannot authorize descendants. V3 writes neither shared arrays nor V2 rows.

This append-only journal has no compaction in this correction. Storage growth can
eventually produce quota failure; that failure remains explicit before new RPCs.
Compaction would need a separately reviewed multi-tab/receipt protocol. Complete
browser-storage deletion cannot recover a lost pending intent in a cold tab;
storage that cannot be verified fails closed. No local fixture proves deployed
Firestore rules, real cross-device convergence or physical iOS behavior.

## Browser evidence publication

`npm run test:e2e:outbox` uses actual app/outbox/cache modules and native Chromium
localStorage/IndexedDB with a synthetic SDK on a loopback server. It tests native
abort-after-request-success, prevented request failure with transaction complete,
LS quota failure, two stale tabs, causal weekly replay and post-commit faults.
It does not contact a live account.

The smoke records `running` initially. Each owner, connection, server and trace
cleanup is attempted even when another fails. Only after those attempts does it
publish final `passed`/`failed`, preserving `primaryError` and `cleanupErrors`.
Any failure exits nonzero. `npm run test:e2e:outbox:negative` starts a real child,
injects an owner-close exception after actual cleanup, and requires child exit 1,
failed evidence and a retained trace with later cleanup stages. The negative
verifier's own pass describes that expected failure contract.
