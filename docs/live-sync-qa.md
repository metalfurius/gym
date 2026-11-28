# Coordinated real Firebase acceptance

This is opt-in QA tooling, not a product change or acceptance result. **Live execution has not been run by the
author.** Local authoring checks use synthetic fixtures only. The runner must be integrated and reviewed on the
final objective-2 candidate before the root executes it. It does not validate a phone, iOS or an installed PWA.

## Scope and prerequisites

Role A runs on Windows; role B runs on a separate Ubuntu machine, normally the opt-in Actions job. Both use
the same clean, full Git SHA, new run UUID and calendar fixture. The two hosts have independent Chrome profiles,
native storage, auth state and queues. Chrome/SDK/Firestore are real during `--live`; no HTML/SDK rewriting,
import map, transaction stub, network proxy or forced successful response is used.

- Project is fixed to `gymm-178fb`; primary UID is `6WE3vNHVpcSE6vPeku9xowLmrXm2`. Role A also needs the
  other test account, UID `UJEfXd7U2YZOJckimFs5JkHaZiV2`, for account switching. Role B may omit other.
- Supply credentials only through `GYM_LIVE_QA_CREDENTIALS_JSON`, structured as
  `{ "primary": { "email": "...", "password": "...", "uid": "..." }, "other": { "email": "...", "password": "...", "uid": "..." } }`.
  Load it privately outside the checkout/command history. Do not paste it into logs, arguments, artifacts or docs.
  No service-account/admin credential, emulator, alternate project or alternate UID is accepted.
- The canonical global and primary UID sync policies must already match version 1 / `gym-sync-v1-2026-11`, and
  the session revision must be valid. An existing canonical UID policy/counter is expected and accepted. The
  runner never deletes, resets or weakens policies, counters, preference receipts or mutation receipts.
- The primary account needs at most 200 persisted sessions, all with readable dates no later than the selected
  second clock. Full paginated baseline enumeration completes before product writes. Unsupported or unprovable
  baseline data aborts the run. Existing session values/IDs are compared before/after and never deleted.
- Use the pinned Chrome for Testing installer/receipt and verified Linux helper already in this repository.
  The runner checks the exact browser version; Linux helper ownership/mode/checksum are checked. Sandbox stays on.

## Calendar fixture and repeat runs

`--base-calendar-iso` or `GYM_QA_BASE_CALENDAR_ISO` sets `baseCalendarIso`; default is
`2026-11-27T12:00:00.000Z`. The second clock is exactly seven days later (default December 4).
Only valid ISO noon-UTC dates are accepted. The base can advance up to 51 weeks from the default so that both
dates remain within the approved 52-week fixture window. Weeks, month/day counts, sentinel date and UI expectations
are derived from this pair. Both browsers use Europe/Paris timezone and only the supported
`globalThis.__GYM_WEEKLY_TARGET_NOW_ISO` calendar override; `Date`, SDK clocks and auth expiry are not changed.

Both roles compare the exact canonical base date alongside SHA/revision in the coordination document **before
browser login/product writes**. An incompatible peer fails closed. Either chosen week already frozen is a
precondition failure, not permission to remove an outcome. After the first scenario, the app can legitimately
freeze the earlier week. A retry therefore needs a **new UUID and a later, unfrozen calendar pair** on both hosts.
Record the chosen pair with that run; never reuse an occupied role claim or overwrite old artifacts.

The default remains unchanged for compatibility. Root reports that the November 27 week was legitimately frozen
by the earlier 47-phase run. A new 60-phase execution therefore needs a new UUID and December 4→December 11,
or a later pair that passes the same unfrozen-week/range guards. Never delete an outcome to reuse a calendar pair.

After the matching-source/calendar barrier and before either browser login, role A creates the single routine
fixture with a create-only precondition. Both roles wait for its verified creation. This keeps routine caches
honest: the runner does not clear storage or call private refresh functions to reveal an out-of-band fixture.

## Windows role A

After checking out the final reviewed candidate and installing Node dependencies, prepare the exact browser.
These commands do not contain credentials:

```powershell
$runId = [guid]::NewGuid().ToString()
$candidateSha = (git rev-parse HEAD).Trim()
$baseCalendarIso = '2026-12-04T12:00:00.000Z'
$runtimeDirectory = Join-Path $env:TEMP ('gym-real-sync-runtime-' + $runId)
$env:BROWSER_SMOKE_INSTALL_RECEIPT = Join-Path $runtimeDirectory 'browser-install.json'
$env:BROWSER_SMOKE_CACHE_DIR = Join-Path $env:TEMP 'gym-smoke-browser-runtimes'
node scripts/install-smoke-browser.mjs chromium
$runtime = Get-Content -LiteralPath $env:BROWSER_SMOKE_INSTALL_RECEIPT -Raw | ConvertFrom-Json
$env:CHROME_PATH = $runtime.executable
node scripts/live-sync-qa.mjs --validate-run --role A --run-id $runId --expected-sha $candidateSha --base-calendar-iso $baseCalendarIso
```

Set the credential environment variable through the root's private credential mechanism, then start A. Keep
the same UUID/SHA/calendar pair for the Ubuntu dispatch. Evidence must be outside the checkout:

```powershell
$qaOutput = Join-Path $env:TEMP ('gym-real-sync-results-' + $runId + '-A')
node scripts/live-sync-qa.mjs --live --role A --run-id $runId --expected-sha $candidateSha --base-calendar-iso $baseCalendarIso --output $qaOutput
```

`--output` must name a **new leaf directory** with an already existing parent outside the checkout. Do not
create that leaf first, reuse an earlier output, or select an alias/junction/symlink. Missing parents are not
created. The workflow's installer already creates the receipt parent; its distinct `role-B` output remains
new. With no `--output`, the runner allocates a fresh private directory under the OS temporary directory and
prints the actual output path. See the private artifact contract below.

## Ubuntu role B and Actions

The existing eight Browser Gates matrix cases and their sandbox setup remain unchanged. A separate job runs
only for `workflow_dispatch`, boolean `real_firebase_qa: true`, and branch
`codex/roadmap-02-history-sync`. It has `contents: read`, installs the exact pinned Chromium/helper and exposes
`GYM_LIVE_QA_CREDENTIALS_JSON` only to the explicit live step. PRs, pushes, forks, tags and other refs do not run it.
The workflow already exists on main, so the root may dispatch the candidate branch without merging QA first.

The root can dispatch with the same public parameters while A waits:

```powershell
gh workflow run browser-gates.yml --ref codex/roadmap-02-history-sync -f real_firebase_qa=true -f qa_run_id=$runId -f base_calendar_iso=$baseCalendarIso
```

Check that the dispatched `github.sha` equals A's expected SHA. B's actual command is the same portable Node
entry point with `--role B`; credentials come from the single opt-in step secret. No remote shell/SSH command
execution facility is implemented. The job uploads its own SHA/UUID/role artifact with `always()`, including
installer/helper receipts and any result/trace that could be produced. A guard failure may have no live result;
that cannot count as acceptance.

## Executed live sequence when enabled

The [declarative phase list](../scripts/live-sync-qa-scenarios.mjs) contains **60 barriers**, preserving all 47
original phase specifications and their relative order. Each role publishes
ready/done/error state and its own results under `roleA` or `roleB` in
`users/{primaryUid}/qa_sync_runs/{runUUID}`. Creation/role claiming uses existence/update-time preconditions;
subsequent PATCHes mask only that role field, preserving the peer. Reads poll at one-second intervals with
bounded phase/global waits (15-minute scenario budget plus bounded cleanup). A peer error aborts waiting.

Before step 1 can advance/freeze the earlier week, both reload at the base clock. A goes offline and saves
target 4 for X (base week), then target 5 for Y (the second week), recording both original operation IDs/times.
A restores its base clock **before reconnecting**. B saves a newer X=6 online. A reconnects: X must remain a
visible durable conflict, while independent Y applies exactly once, drains and has its immutable receipt.
Both verify per-week/global revisions, both original timestamps and unchanged frozen outcomes. A then goes
offline again, makes a new explicit X=3 press, proves the new intent durable, and reconnects. Its receipt must
apply, native journal ACKs must be old-X=`resolved`/new-X=`accepted`, Y and both original receipts must remain
unchanged, and both reload/drain at the base clock. The replacement's **descriptor** `observedWeeklyConflictIds`
must contain exactly the old X queue ID; this is existing runtime metadata outside the payload, observed by
QA rather than added to product state by this runner. The 47 original phases then continue. This new offline
resolution intentionally requires the separate product replay-resolution fix; source 949c791 alone is not
expected to pass it. No product fix is embedded in this QA tooling.

1. Start at base date. A goes offline, advances seven days and queues target 4; B stays at base and saves 6.
   A reconnects; both verify that the two week records survive, then both use the second date.
2. Both reload the same server/base revision, then go offline to hold that exact fixture base. A reconnects
   and saves 5; B presses 7 offline, proves its old-base intent durable, reconnects and observes an actual
   conflict/immutable conflict receipt. A new explicit B press resolves it; both reload to 7 with empty queues.
3. A queues two targets offline with deliberate timestamp rollback; B saves a newer value. A's entire owned
   browser process is closed and restarted offline on the **same** profile. Offline emulation precedes navigation
   from `about:blank`; the real worker remains active. Auth UID, `navigator.onLine === false`, queue IDs/values/
   original timestamps, native IndexedDB journal hash and revision must survive. Reconnect conflicts rather than
   overwrites; explicit resolution converges.
4. Both queue multiple targets offline. Repeat A→B and B→A reconnect orders. The first causal chain commits twice,
   the second conflicts/blocks without changing the newer target, and an explicit new press resolves. Assertions
   compare per-week CAS revisions, immutable receipt timestamps, UI values and queue metadata; HTTP success alone
   is insufficient.
5. Both remain online, reload the same server week/global revision, operation ID and semantic fingerprint, and
   prepare different public target controls (A: 4, B: 6). A separate readiness barrier precedes both Save clicks.
   The runner requires causally overlapping real HTTP Commit windows, exactly one applied and one conflict
   receipt, and exactly one increment of both week/global revisions. The loser makes a new explicit public
   press to resolve to 7. Both reload with empty queues, and both original receipt contents/update times remain
   identical. See the measurement limits below; an unproven overlap fails instead of passing as a race.
6. A queues an owned target offline, logs out, reconnects and logs into other. Primary work stays pending and
   invisible to other's pending count; other's data remains isolated. Returning to primary replays it. Both hosts
   then logout/login/reload through the public UI.
7. A verifies the unchanged UUID-marked pre-auth routine fixture. First, while offline, A saves the **first**
   strength capture (50.5×8) and ordinary Quick Log index 4 through public controls. Both immutable queue IDs,
   session IDs, original model dates, enqueue timestamps and payload SHA-256 values must be durable, with no
   corresponding server documents. A closes its entire browser and starts offline on the **same profile**;
   offline is applied before navigation from `about:blank`, with the real worker still active. Native journal
   rows/hash, owned auth, revision and both complete metadata entries must survive. On reconnect, exactly those
   two IDs must appear once, their server dates/values must match the original intents, the session revision
   increases exactly twice, both immutable create receipts prove the same IDs/revision order, and a further
   reload must not duplicate them. Both clients later open these
   two exact IDs in the normal surface/detail checks below. They count inside the original manifest, preserving
   four captures and the true single-row last page; they are not two extra records.

   A then completes the remaining online records for **four** normal captures in total, with
   `50.5`, `51.5`, `52.5`, `53.5` kg and 8 reps, followed by enough Quick Logs for 11–20 total new sessions,
   making the total collection count end in 1. The four supported calendar values are `currentCalendarIso`
   plus 1, 2, 3 and 4 seconds on the same Europe/Paris day. The runner checks their persisted original timestamps
   and restores **exactly `currentCalendarIso`** before the surface assertions. All session mutations use
   public controls. One Quick Log sentinel is backdated through its public date input to precede the complete
   baseline. Each click must create exactly one new ID and acknowledge in UI. The total counts are derived from
   the complete baseline and verified creation/deletion manifests, not fixed to an empty account.
8. Both compare all history IDs, Hub month/week/day totals, calendar same-day count, empty queues and full
   unchanged server records. Both open every owned strength detail and the sentinel detail **by session ID**,
   comparing the label, original model timestamp, visible localized date and original load/reps or unique note.
   Progress must show 4 sessions, best 53.5 kg and 8 reps; the visible daily table and public Chart.js data must
   agree. Both start a new public capture to inspect the latest 53.5/8 suggestion, press its real reuse-values
   button and cancel. A full server ID/value comparison proves the inspection did not save another session.
9. B reaches the true last history page and deletes its **single verified owned Quick Log sentinel** through UI.
   Both verify every surface again; all four strength records and the 53.5 suggestion remain. B then deletes
   the latest strength ID through UI. Both repeat all surfaces and remaining detail assertions: exactly three
   strength records remain, Progress/chart/table best is **52.5**, and the actual capture suggestion/reuse button
   must fall back to the preceding **52.5/8** record. The >=3 Progress threshold remains exercised after deletion.
   Both clients then reload online and warm all history pages, calendar, Hub, Progress/chart/table, details and
   suggestions after **both deletions**. Each closes the whole owned browser and cold-starts offline on its
   same profile. Public navigation must still show the exact remaining IDs/counts, three strength records,
   52.5/8 chart/table/suggestion values, and no deleted ID. The offline helper consumes its previously verified
   checkpoint and cannot fetch a REST product snapshot to supply the UI. CDP metadata records SDK attempts and
   failed transport events without requiring zero attempts; any noncached Firestore response in that browser
   window fails. Node coordination remains online and is not a browser-cache read. Both finally reconnect,
   reload and reconcile every surface against the actual server again.
10. A deletes only newly identified run sessions through UI. Previous IDs and full values remain identical.
    Fixture cleanup verifies marker/content/current update time and uses CAS deletion; changed or still-referenced
    fixtures are retained with a failure. **Both roles reload and observe UI convergence before destruction**:
    all history IDs and Hub/calendar counts equal the complete original baseline, the run's unique Progress
    exercise is absent and a fresh public capture has no saved suggestion. “Zero” means zero run-owned records;
    a nonempty pre-existing baseline is preserved, not forced to an empty account. Receipts and the control document remain as evidence; preference changes
    are not blindly rolled back.

## Online race measurement and limits

The online case sets genuine CDP network latency to 15,000 ms on each owned page, with `offline: false` and
unlimited throughput. This delays real transport and provides an observation window; it does not intercept,
rewrite, mock or replace a request/response. Ordinary zero latency is restored once the causal handshake ends,
before waiting for SDK retries and the final conflict receipt. A failed observation still runs normal cleanup.

The observer accepts only POSTs to the pinned SDK's exact fixed-project unary Commit endpoint. Its evidence
contains an ordinal, monotonic start/end, start wall time and a derived end wall time, HTTP status,
transport-failure boolean and actual `navigator.onLine` observation. It does not read headers/bodies or retain URL/query
values, never requests a body through CDP, and does not publish CDP request IDs or raw URLs. Online is also checked
before and after both public Save clicks. The first observed Commit must receive a real HTTP response; a failed
transport or later retry cannot substitute for the first request in the overlap proof.

No Windows/Ubuntu clock synchronization is assumed. A announces its first Commit while it is still open;
B observes that announcement while its own first Commit is still open and acknowledges it; A observes B's
acknowledgement while **that same A Commit** is still open. Fixed intermediate signals preserve the normal
ready/done barrier. Both role artifacts retain this causal proof and their bounded Commit metadata windows,
including any SDK retry attempts. Missing/expired observations fail without automatically rerunning the case.

This establishes overlapping **client-observed HTTP in-flight intervals**, including the emulated response
latency. It does **not** establish simultaneous server execution, a common server clock, or which observed HTTP
body contains an operation ID: bodies are deliberately not inspected. Separately, the durable owned intent
metadata and immutable Firebase receipts must prove the same base revision/operation/fingerprint, distinct
original operation IDs/timestamps, one winner/one conflict and exact revision +1. The explicit resolution must
preserve both old receipt hashes (including their update times). These are the precise claims a successful
paired run may support; authorship/unit fixtures do not establish any of them against the live service.

## Evidence, cleanup and interpretation

Before Auth, networking or any long await, the runner exclusively creates a private output and reserves both
`trace.json` and `result.json` with exclusive file creation and no-follow where the OS supplies that flag.
Existing directories/files, including dangling links, fail before service use. Ancestors and the new root
must be directories with matching real paths and stable device/inode identities, without symlinks/junctions.
POSIX ancestors must be owned by the process or root and must not be group/other writable, except root-owned
sticky temporary directories. The new root is owner-only `0700`, and files are owner-only `0600` with one link.
Windows uses a protected current-owner/SYSTEM DACL **at creation** through `CreateDirectoryW`; it does not
apply a later path-based permission change. Local drive paths are required, and Windows path aliases are rejected.

The two original file descriptors stay open for the entire run. Artifact bytes are written and synced through
those same descriptors, never by resolving an output filename again. Identity/privacy checks run before network
use, during independent cleanup, and around final writes. A directory or file-path replacement makes the result
fail; failure artifacts use the original retained handles when those files remain available. Windows may deny a
directory rename while the files are open; that is a prevented substitution. On systems permitting the rename,
the original descriptors still cannot overwrite files behind the new alias. Unexpected extra hardlinks or fd
identity changes also prevent writing. The runner never deletes an artifact output or modifies a preexisting
directory's permissions to make an output acceptable.

Each role writes redacted `result.json` and `trace.json`; raw CDP events, request headers/bodies, console args,
credentials and tokens are never retained. Trace keeps method names only. Errors preserve the primary failure
plus independent cleanup errors. A failed online observation also retains its partial safe metadata window,
explicitly marked active/complete, without presenting an incomplete observation as proof. Every cleanup is attempted; profile deletion requires proved browser shutdown
and an exact owned `os.tmpdir()` prefix/path. A failed close retains the profile and fails acceptance.

Profiles start fresh under `gym-smoke-real-sync-`; they are preserved across scenario restarts and removed only
after final owned-process closure. User Chrome, the P0 retained profile and existing app data are never cleared.
No status is written as passed before cleanup/trace completion and paired readiness. Failure exits nonzero.
Forced process/runner termination can prevent artifact writing; missing artifacts are failure, never success.
The early reserved empty files are not a completed result. Acceptance requires the final valid JSON, a successful
process exit and proved closure of the retained handles as well as the cleanup/trace and paired-readiness checks.

Acceptance requires **both** complete successful role artifacts, identical final SHA/revision/UUID/calendar,
60 completed phases each, matching control results, all actual UI/server/queue assertions and zero cleanup errors.
These scripts have not run live during authorship and provide no final two-judge approval. A real paired run can
support SYNC-04/two-device evidence as agreed; it cannot prove iOS, phones or installed-client update behavior.
Commit-response loss injection is deliberately not implemented: existing unit/native tests cover that boundary,
and this runner makes no claim of observing a forced lost-ACK service retry.

REST protocol references: [Firebase email/password sign-in](https://firebase.google.com/docs/reference/rest/auth#section-sign-in-email-password),
[Firestore PATCH masks/preconditions](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/patch),
[Firestore paginated enumeration](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/listDocuments).
Observation references: [CDP Network timestamps, completion events and latency](https://chromedevtools.github.io/devtools-protocol/tot/Network/),
[pinned Firebase 11.6.1 RPC endpoint mapping](https://raw.githubusercontent.com/firebase/firebase-js-sdk/firebase@11.6.1/packages/firestore/src/remote/rest_connection.ts),
[public Chart.js instance lookup](https://www.chartjs.org/docs/latest/developers/api.html#static-getchart).
Artifact references: [Node exclusive file flags and file-descriptor writes](https://nodejs.org/docs/latest-v22.x/api/fs.html),
[Windows atomic new-directory security attributes](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createdirectoryw),
[protected DACL syntax](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptor-string-format).
