# Contributing Guide

## Deterministic Merge Contract (Hard Policy)

This repository uses a deterministic merge contract for all PRs into `main`, including feature, bug-fix, maintenance, and docs-only PRs.

A PR is merge-safe only when all conditions are true:

- Required status check `merge-ready` is green on the latest commit.
- All PR conversations are resolved.
- The PR branch is up to date with `main`.

## Local Preflight Before Merge Candidate

Run the same local preflight before marking a PR as merge candidate:

- `npm run merge:ready:local`

This command runs the quality gates in the same order as CI:

- `npm run lint:ratchet`
- `npm run format:check`
- `npm run test:app`
- `npm run test:app:offline`
- `npm run test:no-skips`
- `npm run test:coverage:gate`

## PR-First Workflow

This repository uses a PR-first workflow for major features.

- One branch + one draft PR per major feature.
- Keep iterating inside the same PR until merge-safe.
- Do not split a major feature into unrelated parallel PRs unless a separate maintenance task requires it.

## Major Feature Lifecycle

Use these stages in the PR description as work progresses:

1. Draft
2. In Progress
3. Merge Candidate

A major feature PR starts as Draft and only moves to Merge Candidate after the merge contract is satisfied.

## Version Keyword Rule

Version bumping is driven by commit message keywords on merge to `main`.

- Use `[minor]` for new backward-compatible features.
- Use `[patch]` for fixes, docs, tests, and refactors.
- Use `[major]` only for intentional breaking changes.

For the current major feature kickoff below, default to `[minor]` unless scope changes to breaking behavior.

## Dependency and Maintenance PRs

Keep maintenance PRs separate from major-feature PRs.

Examples:

- Dependabot updates
- CI toolchain updates
- Standalone docs-only or test-only maintenance

## Emergency Admin Bypass (Hotfix Only)

Admin bypass or direct push to `main` is allowed only for urgent hotfixes.

- Run `npm run merge:ready:local` before bypass when time allows.
- Document the bypass reason.
- Follow with a normal cleanup PR to restore the full merge contract trail.

## Current Major Feature Kickoff

Milestone: Read-Optimized Weekly Consistency (v1.1)

- Branch: `codex/stabilize-read-optimized-v1`
- PR title (placeholder): `feat: read-optimized weekly consistency (v1.1) [minor]`
- Current scope (this PR):
  - local-first weekly streak/progress computation for Daily Hub without introducing streak persistence in Firestore
  - bounded session-fetch strategy for streak computations with deterministic read ceilings
  - compact cloud sync behavior for weekly target preferences and any minimal derived metadata needed for consistency
  - maintain offline replay safety and timestamp consistency for preference updates
  - keep existing session/routine contracts backward-compatible
- Out of scope for this PR:
  - social mechanics, sharing, or competitive challenges
  - nutrition/body-composition schema expansion
  - destructive migrations or backfill of historical documents
