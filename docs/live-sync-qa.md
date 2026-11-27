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

After the matching-source/calendar barrier and before either browser login, role A creates the single routine
fixture with a create-only precondition. Both roles wait for its verified creation. This keeps routine caches
honest: the runner does not clear storage or call private refresh functions to reveal an out-of-band fixture.

## Windows role A

After checking out the final reviewed candidate and installing Node dependencies, prepare the exact browser.
These commands do not contain credentials:

```powershell
$runId = [guid]::NewGuid().ToString()
$candidateSha = (git rev-parse HEAD).Trim()
$baseCalendarIso = '2026-11-27T12:00:00.000Z'
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

The [declarative phase list](../scripts/live-sync-qa-scenarios.mjs) contains 39 barriers. Each role publishes
ready/done/error state and its own results under `roleA` or `roleB` in
`users/{primaryUid}/qa_sync_runs/{runUUID}`. Creation/role claiming uses existence/update-time preconditions;
subsequent PATCHes mask only that role field, preserving the peer. Reads poll at one-second intervals with
bounded phase/global waits (15-minute scenario budget plus bounded cleanup). A peer error aborts waiting.

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
5. A queues an owned target offline, logs out, reconnects and logs into other. Primary work stays pending and
   invisible to other's pending count; other's data remains isolated. Returning to primary replays it. Both hosts
   then logout/login/reload through the public UI.
6. A verifies the unchanged UUID-marked pre-auth routine fixture. A creates 3 normal `50.5 × 8` captures and
   enough Quick Logs for 11–20 total new sessions, making the total collection count end in 1. All mutations use
   public controls. One Quick Log sentinel is backdated through its public date input to precede the complete
   baseline. Each click must create exactly one new ID and acknowledge in UI. Three captures also exercise the
   actual Progress selector/chart/table threshold.
7. Both compare all history IDs, Hub month/week totals, calendar same-day count, Progress 3-session/50.5/8 values,
   server records and empty queues. B reaches the true last history page and deletes its single verified owned
   sentinel through UI. Both verify every surface again.
8. A deletes only newly identified run sessions through UI. Previous IDs and full values remain identical.
   Fixture cleanup verifies marker/content/current update time and uses CAS deletion; changed or still-referenced
   fixtures are retained with a failure. Receipts and the control document remain as evidence; preference changes
   are not blindly rolled back.

## Evidence, cleanup and interpretation

Each role writes redacted `result.json` and `trace.json`; raw CDP events, request headers/bodies, console args,
credentials and tokens are never retained. Trace keeps method names only. Errors preserve the primary failure
plus independent cleanup errors. Every cleanup is attempted; profile deletion requires proved browser shutdown
and an exact owned `os.tmpdir()` prefix/path. A failed close retains the profile and fails acceptance.

Profiles start fresh under `gym-smoke-real-sync-`; they are preserved across scenario restarts and removed only
after final owned-process closure. User Chrome, the P0 retained profile and existing app data are never cleared.
No status is written as passed before cleanup/trace completion and paired readiness. Failure exits nonzero.
Forced process/runner termination can prevent artifact writing; missing artifacts are failure, never success.

Acceptance requires **both** complete successful role artifacts, identical final SHA/revision/UUID/calendar,
39 completed phases each, matching control results, all actual UI/server/queue assertions and zero cleanup errors.
These scripts have not run live during authorship and provide no final two-judge approval. A real paired run can
support SYNC-04/two-device evidence as agreed; it cannot prove iOS, phones or installed-client update behavior.
Commit-response loss injection is deliberately not implemented: existing unit/native tests cover that boundary,
and this runner makes no claim of observing a forced lost-ACK service retry.

REST protocol references: [Firebase email/password sign-in](https://firebase.google.com/docs/reference/rest/auth#section-sign-in-email-password),
[Firestore PATCH masks/preconditions](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/patch),
[Firestore paginated enumeration](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/listDocuments).
