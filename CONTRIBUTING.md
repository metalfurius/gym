# Contributing guide

## PR workflow

Use one branch and draft PR for a coherent feature. Track its stage as `Draft` → `In Progress` →
`Merge Candidate`, keeping scope, evidence and limitations current. Maintenance work belongs in separate
focused changes; an incompatible major migration needs its own rationale, validation and rollback boundary.
The active roadmap and acceptance criteria live in [UPGRADE-PLAN.md](UPGRADE-PLAN.md) and
[docs/roadmap/README.md](docs/roadmap/README.md), rather than a placeholder feature kickoff here.

Use Node 22.13+ on the Node 22 line (the latest maintained 22 patch matches CI) and a clean `npm ci`.
Node 24 is also supported by the tooling. Do not regenerate the lockfile using forced downgrades or merge a
stale dependency PR without comparing its changes against current main and upstream compatibility guidance.

## Checks before review

For code changes, reproduce the blocking commands:

```sh
npm ci
npm run lint:ratchet
npm run test:no-skips
npm run test:app
npm run test:app:offline
npm run test:coverage:gate
npm run release:check
```

The lint ratchet allows zero warnings. Full Jest coverage requires at least 70% statements and lines;
the subsequent coverage wrapper independently checks statements. `npm run test:all` combines lint, no-skips
and full gated Jest coverage, including unit/integration/app/offline cases. Real-browser and CodeQL checks
remain separate. The authoritative command-to-job table is [TESTING-PLAN.md](TESTING-PLAN.md), with browser
installation and commands in [docs/browser-quality-gates.md](docs/browser-quality-gates.md).

Keep regressions focused on behavior. Preserve existing offline, counting, ownership and release contracts.
Do not skip tests, weaken lint rules or lower coverage to pass CI. `npm run format:check` is advisory in CI;
avoid unrelated formatting churn. Manual test sheets and mock results do not establish live/device acceptance.

Every roadmap implementation requires two independent GPT-6.1-Sol xhigh approvals of the identical final
head, plus its required checks and evidence. A rebase, new commit or generated metadata changes that head
and requires renewed review. Do not describe an objective as complete while its live account/device gates
remain open. In particular, physical Safari/Home Screen PWA evidence for QA-05 is still required.

## Release metadata

Commit message keywords such as `[major]`, `[minor]` and `[patch]` communicate intent; the current workflows
do not automatically bump a version from them. A release owner explicitly runs `node update-version.cjs patch`
(or `minor`, `major`, `X.Y.Z`), reviews the complete generated contract and checks it before freezing the
candidate. See [docs/commit-versioning.md](docs/commit-versioning.md).

Tooling/docs-only changes do not need a product version bump. Changed cached JS/CSS/HTML/assets still require
fresh release metadata and release checks, even when their behavior is unchanged. Keep generated metadata
with the final reviewed source. Never claim an unmerged asset or its hash is already published.
