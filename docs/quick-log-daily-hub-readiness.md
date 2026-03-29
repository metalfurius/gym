# Quick Log + Daily Hub Readiness

Last updated: March 25, 2026
Status: Ready for implementation once hard gates remain green

## Purpose

Define the first Feature/Fun slice (`Quick Log + Daily Hub`) with clear acceptance criteria, rollout guardrails, and go/no-go checks for implementation start.

## Slice Scope

This slice ships two linked capabilities:

1. `Quick Log`: fast add flow to capture a workout result in under 30 seconds.
2. `Daily Hub`: one-screen daily summary of training state and recent activity.

In scope:

- Fast entry of a lightweight workout record.
- Local-first behavior compatible with existing offline queue and reconnect sync.
- Daily summary tiles for "today" context.
- Read-only integration with existing history/progress sources.

Out of scope for this slice:

- Social mechanics, streak challenges, and sharing.
- Nutrition and body-composition schema expansion.
- New backend services beyond current Firestore paths.

## User Outcomes

1. A returning user can log a basic workout event in less than 30 seconds.
2. A user opening the app sees actionable "today" context without navigating to multiple views.
3. Offline users can still log entries and recover seamlessly after reconnect.

## Functional Acceptance Criteria

### Quick Log

1. Entry can be completed with: workout label, date/time (default now), and at least one exercise note.
2. Save action provides immediate success or queued-offline feedback.
3. On reconnect, queued quick-log entries sync automatically and only once.
4. Saved entries appear in history using existing rendering rules.

### Daily Hub

1. Hub renders in under 1 second on warm load in standard desktop/mobile conditions.
2. Hub shows:
   - today's log count
   - last workout timestamp
   - current routine shortcut (if available)
   - sync status indicator (online/offline/queued)
3. Hub gracefully handles empty-state users with a call to start logging.
4. Hub reflects quick-log submissions without requiring full page reload.

## Quality and Reliability Gates

Implementation may start only when all of the following remain green:

1. `npm run lint:ratchet`
2. `npm run test:app`
3. `npm run test:app:offline`
4. `npm run test:coverage:gate` meeting staged threshold for active week
5. `npm run test:no-skips`

## Test Readiness Checklist

Before merge of the first implementation PR:

1. Add unit tests for quick-log payload normalization and defaults.
2. Add integration tests for hub state composition with empty/non-empty data.
3. Extend app journey coverage for quick-log create and hub refresh behavior.
4. Keep offline recovery and retry suites passing without `.skip`.

## Observability and Rollout

Track these metrics during rollout:

1. quick-log save success rate
2. offline queue replay success rate
3. median time-to-log completion
4. hub load error rate

Rollout phases:

1. Internal/local validation with hard gates.
2. Limited beta toggle for selected users.
3. General availability after one week with no Sev-1/Sev-2 regressions.

## Go/No-Go Questions

Ship gate is `No-Go` if any answer is negative:

1. Are all hard quality gates green on `main` and release candidate branch?
2. Are offline save/retry journeys stable in CI and local reruns?
3. Are quick-log entries fully visible in history after sync replay?
4. Is documentation updated for any contract or behavior change?

## Dependencies

1. Existing Firestore/session compatibility contract in `docs/firestore-data-contract.md`.
2. Current offline queue logic in `js/app.js` and `js/modules/session-manager.js`.
3. App journey test harness and Firebase mocks under `tests/integration` and `tests/mocks`.
