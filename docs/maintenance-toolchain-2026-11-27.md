# Objective 4 toolchain and Actions review record

Status: **preparation, not objective completion**, November 27, 2026. The compatible package checkpoint is
`a096162b045a39576d84e629539f8919e5eb920e`, based on merged browser prerequisite
`88f95151f104df58d87e751984de6cd0c5de28d4` ([PR107](https://github.com/metalfurius/gym/pull/107)).
The additional major linter/workflow changes are uncommitted at this preparation milestone. Record the final
integrated head, its fresh CI/artifacts and both identical-head reviews before accepting the implementation.
An earlier package/browser approval does not approve this delta. Physical iOS QA-05 remains **open**.

## Original dependency PR dispositions

Both [PR67](https://github.com/metalfurius/gym/pull/67) and [PR70](https://github.com/metalfurius/gym/pull/70)
were open, unmerged and reported non-mergeable when reassessed. Their base was
`bfe41ff23cb71bc65f9c469b043cfef7d5573145`, not current browser-gates main. Do not merge their stale lockfile
or infer current acceptance from old checks. The combined commit-status endpoint returned no statuses for
either old head; fresh replacement CI is required. Leave the old PRs open until the reviewed replacement is
merged, then close them with its reference.

| Original PR/head | Proposed update | Replacement disposition |
| --- | --- | --- |
| #67 `86d65343810c7f66ceb47a2777c530ef3d122856` | `@jest/globals` 30.2.0 → 30.3.0 | Superseded by compatible checkpoint 30.5.2 |
| #67, same head | `jest` 30.2.0 → 30.3.0 | Superseded by compatible checkpoint 30.5.2 |
| #67, same head | `jest-environment-jsdom` 30.2.0 → 30.3.0 | Superseded by compatible checkpoint 30.5.2 |
| #67, same head | Prettier 3.7.4 → 3.8.1 | Superseded by compatible checkpoint 3.10.1; formatting remains advisory |
| #70 `f1b165d5890f92e9c6086870f1c5209f7a64df8b` | github-script 8 → 9 | Rebuilt at the verified commit below in both current direct usages |
| #70, same head | softprops release 2 → 3 | Rebuilt with supported `with.token`; existing release inputs/permissions retained |
| #70, same head | Codecov 5 → 6 | Rebuilt at the verified commit; existing upload inputs/advisory setting retained |
| #70, same head | test-reporter 2 → 3 | Rebuilt at the verified commit; same-repository/fork guard retained |

The checkpoint also updates `ws` to 8.23.0 and compatible transitive dependencies. This separate migration
adds jest-junit 17.0.0 (Node >=20; verified on Node 22) and ESLint 10's maintained flat-config dependencies.
See the explicit [ESLint major migration/rollback plan](eslint-10-migration.md). No forced audit fix,
package downgrade or broad application rewrite is included. A later upstream major is a separate review;
this record assesses the four Actions proposed by PR70.

## Action source/API assessment

The four annotated tags were dereferenced with `git ls-remote --tags` on November 27, 2026. Workflow pins
use the commits, not tag-object SHAs. Their immutable `action.yml` and README were inspected:

| Action / immutable source | Compatibility and retained boundary |
| --- | --- |
| [github-script v9 / `3a2844b7e9c422d3c10d287c895573f7108da1b3`](https://github.com/actions/github-script/blob/3a2844b7e9c422d3c10d287c895573f7108da1b3/action.yml) | Node 24 action runtime. [v9 changes](https://github.com/actions/github-script/blob/3a2844b7e9c422d3c10d287c895573f7108da1b3/README.md#v9): ESM-only `@actions/github`, newly injected `getOctokit`. Neither current script requires that package or redeclares this parameter; existing `github.rest`, `github.paginate`, builtin `require('fs')` and dynamic import remain supported. Labeler still checks out only the trusted default branch with credentials disabled and filters matching PR head SHA. |
| [softprops v3 / `8a0cd651e5b2365bd640854a3fa5dfc70e4875f3`](https://github.com/softprops/action-gh-release/blob/8a0cd651e5b2365bd640854a3fa5dfc70e4875f3/action.yml) | Node 24 action runtime. Token is a declared input; deprecated environment fallback is replaced by `with.token`. `tag_name`, `name`, `body_path`, `draft` and `prerelease` remain declared. Existing main/path/tag guards and contents-write permission are unchanged. No local release is created by this preparation. |
| [Codecov v6 / `fb8b3582c8e4def4969c97caa2f19720cb33a72f`](https://github.com/codecov/codecov-action/blob/fb8b3582c8e4def4969c97caa2f19720cb33a72f/action.yml) | Composite shell action, with a pinned github-script v8 Node 24 substep. `token`, `files`, `fail_ci_if_error` and `verbose` remain declared. No new OIDC/write permission is requested; upload remains advisory. Its [v6 notes](https://github.com/codecov/codecov-action/blob/fb8b3582c8e4def4969c97caa2f19720cb33a72f/README.md#v6-release) describe Node 24 support. |
| [test-reporter v3 / `d1b5dff021aa968b288b02285a8bf47471c5928a`](https://github.com/dorny/test-reporter/blob/d1b5dff021aa968b288b02285a8bf47471c5928a/action.yml) | Node 24 action runtime; `jest-junit` is supported. `name`, `path`, `reporter` and `fail-on-error` remain declared. Existing checks/pull-request permissions, no-fork write guard and `fail-on-error: false` remain unchanged; missing reports still use `fail-on-empty: true`. Jest failure still fails the test command. |

The Actions runtime is separate from `setup-node`'s Node 22 test runtime. Node 24 Actions need a compatible
hosted runner (github-script documents runner >=2.327.1); these workflows use GitHub-hosted images.
Local YAML/input checks and script compilation with the newly injected parameter are compatibility evidence,
not an execution of GitHub APIs. Hosted action execution, main-only release behavior and final-head CodeQL
remain verification dependencies; no permissions or trust guard was broadened to make them pass.

## Install, audit and local observations

Windows `10.0.26200`, official Node `22.23.5`, npm lockfile version 3. A fresh `npm ci` exited 0 with
400 packages installed. Direct dependencies resolve to Jest trio 30.5.2, Prettier 3.10.1, ws 8.23.0,
jest-junit 17.0.0, ESLint 10.15.0, `@eslint/js` 10.0.1, Stylistic 6.0.1 and globals 17.14.0.
`npm outdated --json` returned an empty object at this observation, not a guarantee about future releases.

`npm audit` reports **18 moderate**, **0 high/critical** findings (20 moderate at the compatible checkpoint).
The remaining chains originate in Jest/coverage's `glob` and `minimatch` dependencies, including
[glob cancellation/traversal](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and
[minimatch amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249). The aggregate includes dependent
Jest packages; it is not 18 independent root vulnerabilities. npm proposes Jest 29.7.0 or `@jest/globals`
30.4.1 downgrades for affected chains. Those are not applied. These are unresolved findings, not an audit pass
or a claim that untrusted dependency input is safe. Track a compatible upstream fix separately.
Install also reports deprecated transitive `glob` 10.5.0 and `whatwg-encoding` 3.1.1.

| Command/observation | Preparation result |
| --- | --- |
| `npm ci`, Node 22 | Passed, clean lockfile install; audit findings above remain |
| `npm run lint:ratchet` / no-skips | Passed; no new rule disabled, authored MJS/browser helpers included |
| Focused actual ESLint and coverage-CLI regressions | 22 tests passed, including warning-only exit 1, new correctness rules, all extensions, below-70/date-bypass rejection and malformed percentages |
| `npm run test:app` | Passed, six app journeys (Firebase mocks) |
| `npm run test:app:offline` | Passed, both dedicated recovery/retry journeys (Firebase mocks) |
| `npm run test:all` | **Failed as expected pending release metadata**: 891 passed / 3 failed, 60 suites. Two service-worker install assertions and one release-integrity assertion reject stale cached-JS hashes. This is not a green full gate. |
| Raw coverage from that failed run | Statements 74.95%, lines 76.50%; the wrapper was not reached because tests failed. Coverage alone does not establish acceptance. |
| jest-junit 17 report | XML parsed successfully; full-run totals 894 tests, 3 failures, 0 errors matched Jest |
| Chromium 158.0.8127.36, Node 22, fresh owned fixture profiles | Normal and 1,000 ms delayed upgrades, canonical worker bypass, numeric and session counting passed; real negative child exit 1 plus failed JSON/PNG/trace confirmed |
| Firefox 160.0.1, existing default TEMP automation cache | **Failed at startup**, before fixture navigation: no owned browsing context, repeated socket/tab subprocess `SpawnTarget` errors `-2147024809`. Original failed JSON/trace/stderr retained. |
| Firefox 160.0.1, fresh verified public automation cache | Upgrade, numeric and real negative child exit 1 passed with the same pinned official archive and sandbox unchanged. This separate diagnostic is not a hidden harness retry; the reused-cache/path discrepancy remains unresolved. |
| Changed documentation | Eight files checked: 60 local links and 60 npm-command references resolve; `git diff --check` passed |
| New final-head Linux/Windows matrix, CodeQL and main-only Actions | Not run at this uncommitted milestone; required after integration/freeze |
| Actual Safari/iOS installed PWA | Not run; QA-05 open |

The three approved cached-asset repairs are only removal of overwritten initial values in `js/ui.js` and
`js/utils/session-variant-overrides.js`, and an unused catch binding in `js/utils/routine-import.js`. Their
bytes changed, so the release owner must regenerate the final contract after the planned integration/rebase.
No version or generated asset metadata has been changed in this preparation. Until that happens, the full
suite/release check must remain failed and no source/hash is described as published.

Local logs, install receipt and browser JSON/PNG/trace artifacts are under
`C:\tmp\gym-roadmap-04-maintenance\tmp\maintenance-*`; they identify the working checkout SHA but include
uncommitted changes, so they are preparation evidence only. The fresh Firefox installation is
`C:\tmp\gym-maintenance-browsers-2026-11-27`; the first failed run used the pre-existing default TEMP cache.
Neither location is a personal browser profile. Both outcomes must be retained when assessing fresh CI.
Read-only comparison found identical SHA-256 values for `firefox.exe`, `xul.dll`, `mozglue.dll` and
`plugin-container.exe` across both installs, while the directory ACLs differ. This is consistent with a
local path/permission boundary; it does not prove the cause, and no ACL was changed for this diagnostic.

## Remaining acceptance

QA-01 awaits the merged replacement and explicit closure references for PR67/70. QA-02 requires real hosted
execution of the pinned Actions on the final head. QA-03's permanent 70% gate and command-to-CI docs are
implemented, with final integrated checks still required. QA-04's browser prerequisite is merged, but this
toolchain candidate needs fresh regression CI. QA-06 awaits final metadata, full app/offline/coverage,
release integrity, browser matrix and CodeQL. QA-05 remains a hard physical-device dependency, so this
prerequisite cannot close objective 4. Obtain both fresh independent identical-SHA reviews before merge.
