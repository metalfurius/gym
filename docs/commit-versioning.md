# Commit Versioning Rules (`major` / `minor` / `patch`)

This repository uses the GitHub Action in [`.github/workflows/version-bump.yml`](../.github/workflows/version-bump.yml) to bump `manifest.json` version **on every push to `main`**.

The workflow reads the **head commit message** and looks for these keywords:

- `[major]` -> bump `X.0.0` (breaking changes)
- `[minor]` -> bump `x.Y.0` (new backward-compatible features)
- `[patch]` -> bump `x.y.Z` (fixes/small safe changes)

If no keyword is present, it defaults to `patch`.

## How to categorize commits

- Use `[major]` when behavior is intentionally breaking for existing users or data/contracts.
- Use `[minor]` for new features that keep existing behavior working.
- Use `[patch]` for bug fixes, refactors without behavior changes, tests, docs, and maintenance updates.

## Commit message examples

- `feat: add routine templates [minor]`
- `fix: prevent duplicate session save [patch]`
- `refactor: simplify cache hydration [patch]`
- `feat!: replace session schema with v2 [major]`

## Important

- Labels do **not** control the version bump in the current workflow.
- The keyword must be in the commit message that reaches `main`.
