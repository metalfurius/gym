# Private artifact sink fix: authoring handoff

Scope: only QA evidence allocation/writing, focused regressions and documentation. Base
**`949c791ccc789058abe28254710c86f45326c1d0`**, branch `codex/roadmap-live-qa-private-artifacts`, isolated worktree
`C:/tmp/gym-live-qa-private-artifacts`. The root's historical paired 47-phase real run and frozen 949 source
were not modified or rerun here. **This security fix has not run against Firebase.** All new runtime probes use
the real filesystem and `runLiveSync`, but every fetch throws locally before sending any service request.
There are no real credentials, browser profiles, account writes or service changes in this authoring work.
The work resumed on November 28 after a pause; actual check timestamps are recorded in the static evidence.

## Confirmed baseline and correction

Judge A's supplied [literal baseline repro](baseline/artifact-race-949.mjs.txt), [proof](baseline/artifact-race-proof.json)
and [log](baseline/artifact-race.log.txt) are preserved copies. They demonstrated CodeQL findings 32/33:
949 recursively created the output, checked names with `access()`, then resolved those names again for final
writes. A junction substituted after the first synthetic fetch redirected both writes over unrelated files.
The baseline repro is retained as evidence and was **not** executed again; its historical assertions expect
the vulnerable behavior. The [manifest](source-manifest.json) binds the copied bytes and corrected source.
The scoped baseline attributes retain the original mixed LF/CRLF bytes and recognize CR as a line ending;
the normal trailing-blank checks remain enabled. Authored source uses canonical LF.
No alert is dismissed or suppressed, and findings 26–31 are outside this fix's scope.

The new [allocator](../../scripts/live-sync-qa-artifacts.mjs) creates a new private leaf only, rejects existing
outputs or missing/aliased parents and records every ancestor/root device, inode and real path. POSIX checks
include owner/mode and a root-owned sticky-temp exception; output/files must be `0700`/`0600`. Windows supplies
the protected owner/SYSTEM DACL to `CreateDirectoryW` at creation, rather than applying `Set-Acl` through a path
later. Only the fixed helper's minimum local environment is passed to PowerShell, never credential variables.
It does not change permissions on a preexisting path or create arbitrary parent directories.

Both artifact files are created exclusively (`O_CREAT|O_EXCL`, plus `O_NOFOLLOW` where available), validated and
retained before the first network/long await. All later bytes are written/synced through those original fds.
No final pathname is reopened. Existing files/dangling links inserted during allocation cannot be overwritten.
File identity and link count are rechecked; unexpected links or an invalid fd refuse writing. Portable Node
does not expose `openat`: private creation and chain checks bound allocation, exclusive creation prevents
overwriting an existing file during it, and retained fds remove the delayed pathname-redirection sink.

The [runner](../../scripts/live-sync-qa.mjs) records path-integrity failures as cleanup failures and writes the
failed result through its owned original handle. Cleanup remains independent, trace precedes final status,
and every handle close is attempted before the terminal console result/return. Close/write failures exit
nonzero. Reserved empty files, missing/partial results and a successful file with a failed process are not
acceptance. The [47 phases](../../scripts/live-sync-qa-scenarios.mjs), fixed UID/project/calendar guards, frozen
weeks, application assets, 75-asset release, workflows, dependencies and browser runtime remain unchanged.

## Local checks and their limits

| Check                                                            | Result                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                         | Exit 0 from unchanged lockfile; existing audit reports 18 moderate issues, no dependency changes          |
| New real-filesystem suite                                        | 18 cases; [focused log](focused.txt), includes actual runner failure after a 1.1-second await; no network |
| All previous focused QA/browser ownership/runtime/sandbox suites | 83 previous tests retained, plus 18 new = 101 in 7 suites; [focused log](focused.txt)                     |
| `npm run lint:ratchet` / `test:no-skips`                         | [Zero-warning lint](lint.txt), [no skips](no-skips.txt)                                                   |
| `npm run release:check`                                          | [Existing v2.8.6 / 75 assets](release.txt), temporary deterministic two-build check, no bump/write        |
| Syntax, phase count and scope/hash checks                        | [Static checks](static-checks.json); all 47 phase declarations unchanged                                  |
| Clean exact-SHA guard and actual `main()` subprocess negative    | Executed after the local source freeze; frozen SHA and external proof location supplied in the handoff    |

Regressions cover an empty/preexisting directory, existing file, junction, dangling junction, aliased ancestor,
missing parents, file/hardlink/dangling-link insertion immediately before the real exclusive `open`, unexpected
second hardlinks, normal reserved-fd writes, closure after allocation failure, and independent close attempts.
Delayed runner tests attempt directory→junction, directory→new-directory, ancestor→junction and both-file
hardlink replacements. They verify the unrelated bytes remain exact, final status is failed and valid original
artifacts are written. In this Windows authoring environment, open handles **blocked directory renames** with
EPERM; those attempts are explicitly asserted, not skipped. File renames/hardlink replacement actually occurred
and the old file handles received the failure artifacts while victim links stayed unchanged. On POSIX the same
tests require successful directory replacement and original-fd failure artifacts; Linux execution remains a
fresh CI/reviewer gate, not a claimed local result.

The original supplied repro and the new tests are local filesystem/security evidence, not new LIVE sync or
backend evidence. No full native outbox or full 47-phase live run was repeated for this QA-only change. Hosted
CodeQL, integrated Linux/Windows CI and two independent reviews of the final integrated SHA remain root gates.
No push, workflow dispatch, permission weakening, secret change, merge or objective closure was performed.
