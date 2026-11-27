# Roadmap execution plans

Status: execution in progress, November 27, 2026. No objective has closed. Production delivery and maintenance
prerequisites are published in v2.8.5; public purge/coherence and desktop browser CI pass. Old installed-client
and actual iOS evidence remain open. [Latest publication record](../maintenance-evidence-2026-11-27.md).

[UPGRADE-PLAN.md](../../UPGRADE-PLAN.md) owns priority and shipped status. These plans turn its seven active
objectives into implementation and acceptance work. Their original planning baseline was published `main`
`d4c6d0d2b8e3950ab1bc97ce9c371dde166fe612` (v2.8.3), including the later counting, numeric-input,
weekly-target and PWA fixes. Local branch `codex/stabilize-read-optimized-v1` and commit `9a6d883` are
reference material, not a delivered implementation or an acceptable substitute baseline. Current published
source is `fd82d8080007c19426a47a17cddb3428ea6ab59d` (v2.8.5); refresh dependency integration and both
reviews against the actual final implementation head. Local implementations of objectives 2/3/5/6 and the
pure-helper foundation for 7 are not shipped features.

| Order | Individual plan                                            | Required dependencies                                  | Closure evidence                                                                                                |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 1     | [Production delivery](01-production-delivery.md)           | Repaired Cloudflare token/policy; installed client     | Successful real purge, repeated canonical coherence, preserved workout through update/offline/reconnect         |
| 2     | [History, progress and sync](02-history-progress-sync.md)  | Independent clients and a designated real test account | Deterministic race/date tests, cross-view agreement, real two-device reconnect/conflict run                     |
| 3     | [Read-optimized Daily Hub](03-read-optimized-daily-hub.md) | Objective 2 account/mutation/completeness contracts    | Current-main baseline versus candidate read counts, persistent offline snapshot, zero fresh-cache session reads |
| 4     | [Maintenance and quality](04-maintenance-quality.md)       | Published #107/#109 foundations; actual iOS device     | Compatible maintenance, reproducible browser CI, observed Safari and installed iOS PWA results                  |
| 5     | [Portable backup](05-portable-backup.md)                   | Objective 2 account/completeness rules                 | Full paginated export fidelity, honest local-only export, reviewed restore design                               |
| 6     | [Saved-workout editing](06-saved-workout-editing.md)       | Objective 2 invalidation/conflict foundations          | Same-ID/date corrections, durable offline/reconnect, conflicts, ES/EN keyboard journeys                         |
| 7     | [Module boundaries](07-module-boundaries.md)               | Objectives 2/3 contracts; finished behavior from 5/6   | Behavioral parity, unchanged wire/queue contracts, unchanged read ceilings, valid PWA graph                     |

Write all seven plans before beginning implementation. Deliver in this order; while an external gate is open,
independent preparation or implementation may continue without describing the blocked objective as delivered.
Keep feature work separate from maintenance and the final refactor. No artificial delivery dates are assigned.

## Shared invariants and checks

- Persisted session identity controls deduplication: two workouts on one day count twice; replay of one ID counts once.
- Keep Spanish wire fields, legacy aliases, execution/load variants, historical weekly outcomes and queued original timestamps.
- Every read, result application, cache key and queued mutation has an explicit owner UID. Account changes invalidate pending UI work.
- A bounded page/window or stale local snapshot is not a complete history. Incomplete data cannot freeze a weekly outcome.
- Do not weaken gates, add skipped tests, force an empty success, or claim mock/browser-fixture evidence proves a live backend/device result.

Use the target checkout's executable scripts. At this baseline the common code-change gate is `npm ci`,
`npm run lint:ratchet`, `npm run test:no-skips`, `npm run test:app`, `npm run test:app:offline`, and
`npm run test:coverage:gate` (statements >=70%), plus green CodeQL on the candidate. Run focused new regression
cases as specified by each plan. Cached-asset changes also require `npm run release:check` and
`npm run test:e2e:upgrade`, with regenerated `release.json` when appropriate. Objective 4 extends reproducible
browser coverage; it must not describe the local `merge-ready` proposal or advisory formatting as existing policy.
Report commands, exits and limitations rather than only a test count. A docs-only planning change needs link,
scope and policy checks; application tests recorded for it are baseline evidence, not implementation acceptance.

## Evidence record

For each objective, keep one review record in its PR, with immutable CI/artifact links and hashes for manual
attachments. Record objective/criterion IDs, full baseline SHA, full candidate SHA, diff scope, commands/exits,
test fixtures and clocks, browser/device/OS versions, observed values, known failures and external dependencies.
Read-count evidence includes request counts and document reads by telemetry label, not an unsubstantiated claim
of lower billing. Live evidence names the deployed SHA and release revision, URL, run ID, UTC timestamps and
redacted account/device identifiers. Never include credentials or another user's workout data.

Use `not run`, `failed`, `blocked`, and `passed` accurately. An unexecuted checklist is not evidence. Commit source,
fixtures, docs and release metadata before freezing the candidate; publish run artifacts against that SHA without
creating a self-referential evidence commit. If evidence is committed later, it creates a new candidate and must
be reviewed as such. Existing dated files under `Validation Evidence/` remain historical evidence.

## Two-judge merge protocol

1. Use an isolated branch/worktree from current `origin/main`. Complete the objective's implementation, tests,
   documentation and generated PWA metadata. Declare the diff and every criterion; no unrelated feature scope.
2. Freeze full PR head SHA **H**, baseline **B**, and the evidence record. Run required gates on **H**. Resolve
   failures before requesting acceptance. Pin all evidence to **H**, or explain the exact deployed descendant
   and prove its relation to **H** for production verification.
3. Spawn **two distinct independent judge agents**, each explicitly **GPT-6.1-Sol** with **xhigh** reasoning.
   Neither may have implemented the change. Give both **B**, **H**, the entire diff, relevant source, individual
   plan, shared invariants and the same evidence. Each inspects and verifies independently before seeing the
   other's verdict. A fallback model, one judge twice, or implementer self-review does not satisfy this gate.
4. Each verdict must state `APPROVE` or `REQUEST_CHANGES`, exact **H**, model/effort, each criterion's
   pass/fail/blocked result, checks independently run, findings with locations, and material limitations.
   Missing required live/account/device evidence prevents approval of objective completion. Resolve every
   actionable finding or explicitly obtain both judges' reasoned agreement that it does not apply.
5. Any implementation fix, rebase, generated-file change, or added commit changes **H** to **H'**. Refresh
   affected verification and obtain **two new independent approvals of the identical H'**. Never combine
   approvals from different heads. A moved base requires checking the merged tree and renewing review if rebased.
6. Merge only after the two approvals and required checks match the final head. Preserve their links and verify
   the merged tree contains the reviewed change. The planner/implementer cannot substitute its judgment for either
   approval. If several PRs are necessary, every implementation PR gets both reviews; dependencies do not confer approval.
7. After deployment, record the merged/release SHAs and live evidence, then update this index, the main roadmap
   and README. Remove an objective from the active queue only after all its completion criteria are met and both
   judges have reviewed the complete evidence. A release check, deploy success and user-observed update are separate results.

Main-only production workflow changes have a real verification dependency: a narrowly declared **prerequisite**
implementation PR may receive both judges' approval and merge before that new workflow can run on `main`.
Its scope and pending live criteria must be explicit. This is permission to merge that prerequisite, **not** to
close objective 1. Actual purge/canonical/installed-client evidence and a separately two-judge-reviewed closure
record are still required. Apply the same rule to a necessary reviewed device-test prerequisite; an absent iOS
device never becomes a passing manual test.

## Operational and device gates still open

- Cloudflare: a new zone-scoped account token is verified, the production secret is updated, and the real
  workflow repaired rule order, purged 64 URLs and passed two canonical sweeps on v2.8.4 and v2.8.5. Credentials are absent
  from the evidence. This closes the access dependency, not the installed-client or objective-closure gates.
- Real devices/accounts: retain or obtain a designated test account, two independent devices for sync evidence,
  a previously installed client for production upgrades, and an actual iOS device for Safari/Home Screen PWA
  evidence. Record unavailable access as a dependency and keep the corresponding criteria open.
- Backend activation: stricter rules source and its required emulator checks are merged. Actual rules deployment,
  readback/propagation verification and the administrator-owned global sync attestation remain open. Client
  features depending on that protocol are local until their own accepted rollout; do not infer deployment from CI.
