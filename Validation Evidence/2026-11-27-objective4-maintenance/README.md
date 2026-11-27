# Maintained quality tooling: root candidate checks

Scope: objective 4's dependency/linter/Actions and truthful-gates prerequisite.
This does **not** close physical iOS/Safari/Home Screen QA or the full objective.
The candidate is based on merged main
`ebb887b967ec22b021858bf1feaa79010c4b1605`. Other unpublished feature branches
are separate from this candidate's runtime contract.

The prior preparation was checkpointed at `67da573`, then rebased onto main
to produce `bdeb8b8eecd72a646ea4b56fce2d30cbbb547c97`. Changes include maintained
ESLint 10 flat config/Stylistic 6 without disabling recommended correctness
rules, Jest 30.5.2/Prettier 3.10.1/ws 8.23/jest-junit 17, the permanent 70%
gate and reviewed immutable Action pins. Three semantic-neutral cached JS
repairs require coherent product metadata: root selected v2.8.5 and regenerated
the **61-asset** contract. No deployment is claimed by these local checks.

## Executed local checks

- Full suite after release preparation: **60 suites / 894 tests pass**, 74.95%
  statements / 76.50% lines (`coverage.txt`, `coverage-summary.json`,
  `junit.xml`). All app/offline journeys are included in that broad run.
- Permanent coverage wrapper, zero-warning `lint:ratchet`, no-skipped-tests and
  two-build release integrity: pass.
- Native Chromium 158.0.8127.36 two-version upgrade, draft preservation,
  offline restart and recovery: pass (`upgrade.json`). It uses synthetic release
  fixtures in a fresh owned browser, **not an OS-installed production client**.
- Runtime for this root renewal: Node 24.12.0 on Windows 10.0.26200. The earlier
  documented preparation also ran on official Node 22.23.5; final hosted CI
  still has to execute its configured Node 22 runtime.
- All four official annotated tags were dereferenced again. Their commit SHAs
  still match the pins; tag-object SHAs were not substituted for commits.

The earlier failed stale-release run and the Firefox reused-cache startup
failure remain explicitly recorded in the
[toolchain review](../../docs/maintenance-toolchain-2026-11-27.md). The refreshed
coherent release resolves the three hash failures. A fresh public Firefox cache
passed the earlier preparation's browser cases; hosted clean-cache matrix
evidence is still required rather than hiding the earlier local discrepancy.

The main dev-dependency audit remains 18 moderate findings, zero high/critical;
they are documented unresolved upstream chains. This is not an audit pass.
The isolated Firestore test package retains its separately documented audit
scope. No forced downgrade, bypass status, permission expansion or weaker
coverage rule is part of this change.

`source-manifest.json` hashes canonical staged Git source bytes with BOM
preserved, separately from artifacts. Console coverage whitespace is normalized
to LF and trailing table padding removed. The artifacts name the base checkout
because release metadata was prepared in its working tree; source hashes pin
the actual candidate bytes. Hosted checks, both independent GPT-6.1-Sol xhigh
exact-head approvals and subsequent publication evidence remain outstanding.
PR67/70 stay open until a reviewed replacement is actually merged.
