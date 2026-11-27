# Reproducible browser quality gates

This is an objective 4 prerequisite, based on `54e83fbfb263be2e601e1db3d2074275329de40e`.
It changes test tooling and CI only. Application assets, service worker and release version remain unchanged.
The [objective plan](roadmap/04-maintenance-quality.md) and [shared protocol](roadmap/README.md) still apply.
Linux CI results and two identical-head reviews are required before accepting this prerequisite. Objective 4
also requires the separate maintenance work and physical iOS evidence; this document does not close it.

## Commands and CI

Use supported Node 22 and run `npm ci`. CI uses the latest maintained Node 22 patch. This was checked against
the [official Node release schedule](https://nodejs.org/en/about/previous-releases).

| Command                                                                  | Browser selection                                              | Blocking CI job                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `npm run test:e2e:upgrade`                                               | `CHROME_PATH`, then standard installation                      | Existing `Tests / Run Tests`, normal and 1,000 ms bootstrap delay         |
| `npm run test:e2e:upgrade:firefox`                                       | `FIREFOX_PATH`, then standard installation                     | `Browser Gates / Browser / <os> / upgrade-firefox`                        |
| `npm run test:e2e:numeric`                                               | `NUMERIC_SMOKE_BROWSER=chromium` or `firefox`; `all` runs both | `Browser Gates / Browser / <os> / numeric-chromium` and `numeric-firefox` |
| `npm run test:e2e:session-counting`                                      | Chromium                                                       | `Browser Gates / Browser / <os> / counting-chromium`                      |
| `node scripts/verify-browser-smoke-negative.mjs chromium` (or `firefox`) | The selected browser                                           | Additional required step in each numeric job                              |
| `node scripts/browser-owned-target-smoke.mjs`                            | Chromium                                                       | Additional required step in each Chromium browser job                     |

`<os>` is `ubuntu-24.04` and `windows-2025`, both x64
[GitHub hosted runner labels](https://github.com/actions/runner-images#available-images). The separate
[`browser-gates.yml`](../.github/workflows/browser-gates.yml) runs all eight cases on every PR to main,
push to main and manual dispatch. There is no browser skip or allowed failure. A missing executable, protocol
failure, assertion failure, cleanup failure or missing required artifact fails its job. Existing Tests, no-skips,
coverage (70% statements), lint and CodeQL gates remain in force. Repository branch protection must include
these new contexts when the reviewed workflow is integrated; a workflow file alone does not configure that rule.

## Exact official browsers

[`browser-runtime-lock.json`](../scripts/browser-runtime-lock.json) fixes the complete download URLs,
versions, platform archives and SHA-256 values. The installer downloads into a private automation cache; it
does not install or update the user's browser. No Playwright cache or developer home directory is a default.

| Browser            | Version       | Platform    | Archive SHA-256                                                    |
| ------------------ | ------------- | ----------- | ------------------------------------------------------------------ |
| Chrome for Testing | 158.0.8127.36 | Windows x64 | `6a8ad290952cc612c7777ffb3eb62f345539a2a1a8d440cfac190c6d36b34d2c` |
| Chrome for Testing | 158.0.8127.36 | Linux x64   | `dba9cc838e1ce269c33ea68170881127bd15d078fc3ca5891c90802819a4d7c7` |
| Firefox            | 160.0.1       | Windows x64 | `768e29619f3463c157f20c5ab1e4d480acfb0d84f1a39ee60ef3151fed91ceb2` |
| Firefox            | 160.0.1       | Linux x64   | `844d8a77aa4672a08ded949b6206f84d91bb82f6637c090fd58c3126e9d44119` |

Versions and URLs were checked on November 20, 2026 against the official
[Chrome for Testing catalog](https://googlechromelabs.github.io/chrome-for-testing/) and
[Mozilla release metadata](https://product-details.mozilla.org/1.0/firefox_versions.json).
Mozilla's hashes come from its published
[SHA256SUMS](https://archive.mozilla.org/pub/firefox/releases/160.0.1/SHA256SUMS).
Chrome's SHA-256 values were calculated from the exact official TLS downloads; each download also matched
Google Storage's `x-goog-hash` MD5 (`qWZnDFugKBegoJpVDRr1wg==` Windows,
`xmTYpjL3Of9XM+V8v3+UHw==` Linux). These are repository-pinned SHA-256 values, not vendor-signed checksums.
[Chrome for Testing](https://developer.chrome.com/docs/automation-and-testing/chrome-for-testing) provides
versioned automation binaries without automatic browser updates.

The installer verifies the archive before extraction and verifies it again on cache reuse. Its installation
receipt records the archive hash, version and path; the cache marker additionally checks the extracted
executable hash. A corrupted cache fails closed and requires a new cache directory. Windows uses its native
`tar` to unpack the official ZIP or Firefox self-extracting archive without running the installer; Linux uses
`unzip` and `tar`. Both hosted OS images provide these commands and browser runtime libraries; a missing
library still fails the real browser launch rather than skipping the case.

In PowerShell:

```powershell
$chrome = node scripts/install-smoke-browser.mjs chromium | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Chrome installation failed' }
$firefox = node scripts/install-smoke-browser.mjs firefox | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Firefox installation failed' }
$env:CHROME_PATH = $chrome.executable
$env:CHROME_EXPECTED_VERSION = $chrome.version
$env:FIREFOX_PATH = $firefox.executable
$env:FIREFOX_EXPECTED_VERSION = $firefox.version
$env:NUMERIC_SMOKE_BROWSER = 'all'
npm run test:e2e:numeric
npm run test:e2e:session-counting
npm run test:e2e:upgrade:firefox
node scripts/verify-browser-smoke-negative.mjs chromium
node scripts/verify-browser-smoke-negative.mjs firefox
```

In a POSIX shell:

```sh
set -eu
install_directory="$(mktemp -d)"
node scripts/install-smoke-browser.mjs chromium > "$install_directory/chrome.json"
node scripts/install-smoke-browser.mjs firefox > "$install_directory/firefox.json"
export CHROME_PATH="$(node -p 'require(process.argv[1]).executable' "$install_directory/chrome.json")"
export CHROME_EXPECTED_VERSION="$(node -p 'require(process.argv[1]).version' "$install_directory/chrome.json")"
export FIREFOX_PATH="$(node -p 'require(process.argv[1]).executable' "$install_directory/firefox.json")"
export FIREFOX_EXPECTED_VERSION="$(node -p 'require(process.argv[1]).version' "$install_directory/firefox.json")"
NUMERIC_SMOKE_BROWSER=all npm run test:e2e:numeric
npm run test:e2e:session-counting
npm run test:e2e:upgrade:firefox
node scripts/verify-browser-smoke-negative.mjs chromium
node scripts/verify-browser-smoke-negative.mjs firefox
```

The installer automatically writes the path and expected version to `GITHUB_ENV` in CI. Explicit invalid
`CHROME_PATH`/`FIREFOX_PATH` values fail; they never silently select another installed browser.

## Real assertions and isolation

Numeric fixtures still execute the production numeric-input and validation modules. Both browsers check
incremental decimal typing, comma normalization, rounding, signed bodyweight, user bodyweight, five malformed
rep strings retained as invalid, blocked submission, corrected whole reps, accessible error text and input attributes.
The counting fixture executes the production helpers: two different same-day IDs count as two sessions,
a duplicate replay does not add a third, the weekly target is met, and the rendered values agree.

Firefox now uses the same two-release fixture and assertions as Chromium. The harness waits for initialized
listeners and active controller A, then installed waiting B and the visible update button. A trusted pointer
click applies B; one controller-change handler reloads exactly once. It verifies the complete original workout
string and field, activation backup, release manifest, module hash, update messaging and obsolete-cache deletion
before and after offline restart/reconnect. Accessible status/live-region/label checks also remain required.
See the [Chromium lifecycle details](chromium-upgrade-smoke.md).

Firefox's offline case retains the original controlled HTTP-server outage: requests are actually disconnected,
then the page reloads through the service worker. Chromium retains CDP offline emulation. Both now assert an
uncached connectivity request fails during the outage and returns `online` after recovery. The evidence records
which model ran. Firefox BiDi offline emulation was tried locally and rejected as unsuitable for this fixture
because cached resource fetches failed; there is no silent fallback or claim of physical-device disconnection.

The common driver uses loopback endpoints from its own process: Chrome's private `DevToolsActivePort` file
and Firefox's own BiDi startup stream. Chromium connects to the browser WebSocket from that file, creates the
fixture URL with `Target.createTarget`, and attaches only that returned target using a flattened session. It
never selects or navigates the CLI startup page. Its document barrier verifies the actual URL and completed
document; `Page.navigate.errorText` fails immediately, and an explicit reload requires a new completed loader.
Only endpoint publication and document readiness are polled; failed navigation is never relaunched. The [CDP schema](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/browser_protocol.json)
defines the target/session and navigation result fields. The trace records command names, target/session IDs
and the ready document. Ports are allocated by the OS (`0`). Each invocation has a new OS-temp
profile and an ephemeral HTTP port. Firefox uses the documented
[Remote Agent](https://firefox-source-docs.mozilla.org/remote/Security.html) and
[WebDriver BiDi commands](https://w3c.github.io/webdriver-bidi/), including trusted pointer input and
`browser.close`. It does not depend on Firefox's removed CDP support.

The real owned-target regression holds a pre-existing tab's HTTP navigation open while the production
connector loads a distinct fixture target. It verifies the CLI and pending target IDs were not reused, the
fixture was requested once, and completing the other tab's navigation does not change its URL/body. A broken
navigation must surface `errorText` after one `Page.navigate` command. The browser may retry its failed HTTP
request internally; the harness never sends another navigation command. JSON, trace and screenshots preserve
both the isolated page and the navigation error document. This is a real Chromium run, not a protocol mock.

Cleanup first requests graceful browser shutdown while the protocol is connected. The reviewed owned-process
helper bounds shutdown and, if needed, terminates only its own process group/tree. Profile removal happens
after process shutdown. Real wrapper/inherited-handle and cancellation regressions remain in the unit suite;
the added environment regression also verifies child configuration does not change the parent environment.

## Deadlines and artifacts

Startup is bounded at 30 seconds, protocol connection/commands at 10 seconds, readiness at 20 seconds and
fixture cancellation at 60 seconds. Upgrade retains its 90-second cancellation budget and 20-second build
subprocess limits. An in-progress bounded command and cleanup may finish after a cancellation deadline;
CI additionally limits each smoke/negative step to three minutes and the installation to five minutes.
The negative checker has a 90-second child deadline and owned-process cleanup. No elapsed sleep establishes success.

Defaults write new timestamp/PID directories under ignored `tmp/browser-gates` or `tmp/upgrade-smoke`.
`BROWSER_SMOKE_EVIDENCE_DIR` and `UPGRADE_SMOKE_EVIDENCE_DIR` select explicit output roots. The optional
`BROWSER_SMOKE_CACHE_DIR`, `BROWSER_SMOKE_DOWNLOAD_DIR` and `BROWSER_SMOKE_INSTALL_RECEIPT` configure only
automation installation files. Historical `Validation Evidence/2026-07-22-*` files are not modified.

Each case writes initial `running`, then final `passed`/`failed` JSON with checkout SHA, UTC times, browser
version, observations/errors and cleanup outcome. A pass is written only after cleanup. Numeric/counting
include a protocol trace and success PNG, or failure PNG if a browser exists. Upgrade includes a trace,
update-available/desktop/mobile PNGs and failure diagnostics. Startup failure has JSON/trace but cannot have a
page screenshot; forced termination can leave the initial `running` record. CI always attempts artifact upload,
including the installation receipt, and rejects an absent artifact directory. Desktop mobile-size PNGs are
viewport checks, never iOS evidence.

The negative checker launches the real numeric runner, lets the actual browser fixture execute, then presents
a deliberately malformed corrected-reps result to the existing assertion. It accepts only child exit `1`, the
specific assertion error, failed evidence with the malformed value, a valid PNG and a nonempty real browser
trace. An unrelated startup error cannot satisfy that check. `negative-check-<browser>.json` records the
expected failure verification; its child evidence remains `failed`.

## Preparation evidence and open gates

### PR107 diagnostic follow-up

The first [browser matrix run](https://github.com/metalfurius/gym/actions/runs/44787925663) failed Chromium
cases while Firefox passed. Windows traces exposed the CLI startup-page navigation race and an ignored
`Page.navigate.errorText`. The [diagnostic run](https://github.com/metalfurius/gym/actions/runs/44789311772)
on `0b6fd0c998e1a24ef13635e1fd2a1107d17deb82` retained the Linux startup failure in JSON/trace:
`No usable sandbox!`, explicitly identifying Ubuntu's AppArmor/user-namespace restriction before CDP.
Those failed runs remain failed evidence; the earlier local preparation results below do not supersede them.

The later [diagnostic run on d1f5eb8](https://github.com/metalfurius/gym/actions/runs/44792853208)
proved why selecting the preinstalled helper failed: `/opt/google/chrome/chrome-sandbox` was a regular
root-owned file with mode `777`, while the pinned archive's `chrome_sandbox` was a regular runner-owned file
with mode `755`. All four Firefox jobs passed; both Linux Chromium jobs stopped at the strict helper-mode
check and both Windows Chromium jobs failed with executable-access/network-service sandbox errors. These
remain failed CI results.

### Platform sandbox correction, November 27

CI now places browser binaries in an explicit binary-only cache below `runner.temp`. Windows installation
adds the documented AppContainer/LPAC read-and-execute access for `S-1-15-2-1` and `S-1-15-2-2`, using native
Windows ACL APIs. The [Puppeteer Windows troubleshooting guidance](https://pptr.dev/troubleshooting#chrome-reports-sandbox-errors-on-windows)
and [Chromium LPAC filesystem requirements](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/design/sandbox.md#lpac-file-system-permissions)
explain these permissions. Access rules do not inherit: only files/directories enumerated from the
SHA-256-verified public browser archive receive RX. Links and hard links are rejected. Downloaded dictionaries
or any other unlisted files are excluded. Cache/install ancestors and unlisted entries have their DACLs
compared before/after; a change, denied read access or broader write permission fails installation. The receipt
records successful readback of all public targets, representative SID grants and unchanged ACL counts.
Profiles and user data remain outside that permission operation.

Linux CI uses the pinned archive member, following
[Chromium's sandbox setup guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).
The member SHA-256 is `c6733ac7189cd66d34b0dc5715d58b7ae30b01984a7cc814a7cd8f824f81ea7a`, calculated
from the exact archive whose SHA-256 is recorded above. After verifying its receipt, source type, link count
and hash, the CI-only setup installs a root-owned copy under `/usr/lib/gym-smoke-sandbox`. It checks the
ancestors are root-owned and not group/world writable and the dedicated directory is root:root `0755`.
The copy initially has mode `0755`; its owner/type/hash are checked before enabling `4755`, then checked again.
`CHROME_DEVEL_SANDBOX` names only that verified copy. `sandbox-helper.json` records both hashes, ownership,
modes and paths. The mode-777 preinstalled helper is never modified. Sudo calls have 15-second limits and the
setup step has a two-minute limit. No global AppArmor setting or browser sandbox-disabling flag is used.
A local Linux invocation outside Actions must configure a supported sandbox using the official instructions;
the privileged setup script refuses to alter a non-CI host.

Local Windows validation on November 27 passed numeric, counting, the owned-target regression, two normal
and two delayed upgrades, plus the real negative numeric child exit 1. Stderr contains neither executable
access-denied nor network-service-crash messages after setup. The real installer checked 313 public targets
and confirmed four other DACLs unchanged on cache reuse, including a downloaded dictionary. The 29 focused
runtime/permissions/owned-process tests passed. Filesystem boundary/tamper tests are deterministic local
coverage; the privileged Linux copy and complete platform result still require new real CI on the final SHA.
No approval from an earlier head applies to this correction.

The navigation correction is shared by numeric/counting and the existing Chromium upgrade launcher. The
startup diagnostics regression uses a real failing process and verifies stderr/exit status survive owned
cleanup into JSON/trace. Numeric/counting fixtures and their original assertions remain literal unchanged.
The updated local runs use `C:\tmp\gym-pr107-owned-target\final`; final-head hosted results and fresh two-judge
approval are still required. Under Windows `10.0.26200`, Node `22.23.5`, Chrome `158.0.8127.36` and Firefox
`160.0.1`, the corrected working tree passed three normal upgrades, three delayed upgrades, three owned-target
regressions, numeric in both browsers, counting Chromium and Firefox upgrade. All upgrades recorded one
trusted Apply click and one controller reload; the slowest repeated Chromium run took 44.259 seconds within
its 90-second budget. Both real numeric negative children returned 1 with failed JSON/PNG/trace and their
checkers passed. The 20 runtime/owned-process tests, lint, no-skips and release-integrity check also passed.
These are local working-tree results; the new final candidate still needs the complete hosted matrix.

The earlier preparation record follows for provenance.

Local working-tree validation on November 20, 2026 used Windows `10.0.26200`, official Node `v22.23.5`,
Chrome `158.0.8127.36` and Firefox `160.0.1`. Node's archive matched its official published SHA-256.
This is preparation evidence against the baseline plus uncommitted tooling, not final-head or Linux evidence.
Local artifacts are outside the repository at `C:\tmp\gym-roadmap-04-browsers-artifacts\windows-node22-final`.

| Check                                                     | Observed result                                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Numeric Chromium / Firefox                                | Both passed; original numeric and accessibility contracts                                                 |
| Counting Chromium                                         | Passed: monthly `2`, weekly `2/2`, two sessions, one active day                                           |
| Firefox upgrade                                           | Passed: v2.7.0 → v2.7.1, exact workout, hashes, update action, offline/reconnect                          |
| Chromium upgrade normal / delayed 1,000 ms                | Both passed with original lifecycle assertions plus connectivity/accessibility checks                     |
| Real negative numeric, both browsers                      | Child exit `1`; failed JSON, failure PNG and trace; checker exit `0`                                      |
| Explicit missing Chromium path                            | Runner exit `1`; failed `ENOENT` JSON, no fallback                                                        |
| Clean `npm ci` under Node 22                              | Passed; existing 21 audit findings (1 low, 13 moderate, 7 high), tracked by the separate maintenance work |
| Focused runtime/owned-process tests                       | 19 passed in two suites under Node 22                                                                     |
| Lint ratchet / explicit changed-script lint / no-skips    | Passed                                                                                                    |
| Release integrity, two builds                             | Passed; v2.8.4 and 61 cached assets, no product metadata change                                           |
| Linux and Windows hosted CI on final candidate            | Not run at preparation handoff; required before acceptance                                                |
| Shared app/offline/coverage and CodeQL on final candidate | Required at integration/freeze                                                                            |
| Physical Safari/iOS and installed Home Screen app         | Not run; QA-05 remains open                                                                               |

QA-03 gains an executable command-to-job mapping. QA-04 remains pending actual eight-job CI results and
immutable artifact links. QA-06 retains the broader shared gates and two-version smokes. QA-01/02 are owned
by the separate maintenance prerequisite, and QA-05 requires the physical-device scenarios in the plan.
Obtain two independent GPT-6.1-Sol xhigh approvals of the same final integrated SHA before merging this prerequisite.
