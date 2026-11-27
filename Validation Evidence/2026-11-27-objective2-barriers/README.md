# Objective 2: independent pending mutation barriers

Status: local regression correction, **not final live acceptance or objective
closure**. Base `c0318eebc37e9377d780eac535761ce22eb6648d` passed all hosted
checks, including the real-browser outbox regression. Independent GPT-6.1-Sol
xhigh judge B nevertheless reproduced another P1: a failed/acknowledgement-
unknown RPC S1 left a pending invalidation per cache prefix, then a different
successful mutation S2 replaced and settled it. A stale snapshot containing S1
became writable and survived cold restart. The original pending RPC could
complete later, with no remaining local invalidation.

## Correction

Each mutation attempt now has a unique barrier identity, with independent
durable records for each affected prefix. A successful mutation settles only
its captured tickets and older attempts of the **same immutable session intent**
(same persisted sessionId and create/delete kind). This relies on the caller's
immutable receipt/tombstone protocol: a replay of that identity cannot perform
another late change. A different identity, different kind, anonymous unknown
operation, normal auth eviction or fresh query cannot settle those records.
Receipt-based recovery enumerates all pending identities and verifies each
before settling its exact captured ticket. Legacy single-prefix records remain
readable and require the same proof.

All preflight tickets share a unique attempt identity. If preflight fails, the
RPC callback has not begun: cleanup can cancel only that attempt, including a
partially written ticket that never returned. A previous unknown RPC's tickets
survive. If storage itself still cannot persist cancellation, the cache stays
conservatively blocked and no backend write or durable-success claim occurs.
Acknowledged backend writes are still not converted into new-ID save retries
when post-commit cache settlement fails. Tickets have no unsafe expiry/TTL.

## Evidence and scope

- Final local broad suite: **69 suites / 1009 tests pass**, 80.28% statements /
  82.81% lines (`coverage.txt`). Lint, no-skipped-tests and two-build release
  integrity pass; unpublished v2.8.5 remains 73 cached assets. No release bump
  or service publication occurred.
- Focused actual-module cache/protocol/outbox/owner tests: **4 suites / 60 tests
  pass**, including S1 unknown + unrelated S2 success + cold restart, matching-
  intent recovery, anonymous unknown operations, and partial preflight failure
  both with and without an older pending identity. The preflight callback is
  asserted never called; older pending records remain present in both stores.
- `browser-positive.json`: actual Chrome 158.0.8127.36, actual production
  modules and native localStorage/IndexedDB. The existing multi-tab outbox
  checks pass. The added simulated-RPC-boundary scenario remains blocked after
  S2; all eight pending rows (four prefixes in two stores) still identify S1;
  a new page restores no stale snapshot. **RPC callbacks are simulated**, not
  real Firebase writes or service acknowledgements.
- `browser-negative-c031.json`: the independent judge's pre-correction Chrome
  reproduction, preserving its false writable-after-S2 result, stale cold
  snapshot and empty pending list. Its callback boundary is likewise simulated.
- The independent executable Node reproduction was rerun unchanged against the
  modified candidate: `writableAfterUnrelatedSuccess:false`, `cold:null`, exit
  zero. Its printed `head` names the base checkout while dirty; it must not be
  presented as a committed-c031 pass. Canonical source hashes identify the
  corrected source separately.

`source-manifest.json` records canonical staged Git source bytes (LF with BOM
preserved), separately from local artifact bytes. Console files normalize CRLF
and remove trailing table-padding whitespace only. Full local browser trace is
retained at `C:/tmp/gym-roadmap-02-barrier-browser-positive/trace.json`, with its
hash in the manifest. Hosted final-head checks, fresh independent
reviews, backend deployment/readback/attestation and real-client final
acceptance are still required. The original synthetic client can authenticate
and read its own Firebase data; administrative credentials lack project use
permission. No server policy, service data or user-owned Chrome profile was
modified for these regression tests.
