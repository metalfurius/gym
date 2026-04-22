# Contributing Guide

## PR-First Workflow (Soft Policy)

This repository uses a PR-first workflow for major features.

- One branch + one draft PR per major feature.
- Keep iterating inside the same PR until merge-safe.
- Do not split a major feature into unrelated parallel PRs unless a separate maintenance task requires it.
- This is policy-driven for now (no branch-protection automation changes in this phase).

## Major Feature Lifecycle

Use these stages in the PR description as work progresses:

1. Draft
2. In Progress
3. Merge Candidate

A major feature PR starts as Draft and only moves to Merge Candidate when all required gates are green and review feedback is resolved.

## Required Gates Before Merge

Every major feature PR must pass:

- `npm run lint:ratchet`
- `npm run test:app`
- `npm run test:app:offline`
- `npm run test:coverage:gate`
- `npm run test:no-skips`

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

## Current Major Feature Kickoff

Milestone: Read-Optimized Weekly Consistency (v1.1)

- Branch (placeholder): `codex/major-read-optimized-weekly-consistency-v1-1`
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
