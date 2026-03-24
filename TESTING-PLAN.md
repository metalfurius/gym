# Testing Plan

This file maps each testing layer to concrete files in this repository.

## 1) Unit Tests (fast, isolated)

- Location: `tests/unit/*.test.js`
- Coverage target: pure logic, utilities, module-level behavior.
- Main setup: `tests/setup.js`

## 2) Integration Tests (cross-module workflows)

- Location: `tests/integration/*.test.js`
- Existing workflow checks:
  - `tests/integration/app-workflow.test.js`
  - `tests/integration/firebase-integration.test.js`

## 3) App-Level Journey Test (real UI flow, automated)

- Primary file: `tests/integration/app-user-journey.test.js`
- Secondary file: `tests/integration/app-auth-navigation.test.js`
- Offline recovery file: `tests/integration/app-offline-recovery.test.js`
- Offline retry file: `tests/integration/app-offline-retry.test.js`
- What it validates:
  - signup/login transition from auth view to dashboard
  - routine creation and edit through the real routine editor form
  - in-progress session resume behavior from dashboard
  - session start and save from dashboard/session views
  - history rendering with the saved workout
  - routine deletion regression behavior
  - logout/login persistence and multi-routine switching behavior
  - offline queueing and automatic persistence after reconnect
  - retry flow when the first reconnect attempt fails

## 4) Firebase Runtime Mocks for App-Level Tests

- `tests/mocks/firebase-app.js`
- `tests/mocks/firebase-auth.js`
- `tests/mocks/firebase-firestore.js`
- `tests/mocks/firebase-state.js`

These mock files are wired in `jest.config.js` through URL module mapping for:

- `https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js`
- `https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js`
- `https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js`

## 5) Manual Browser Validation

- Location: `tests/manual/*`

## Commands

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:app` (runs ESLint errors check first, then app journeys)
- `npm run test:app:only` (app journeys only, no lint gate)
- `npm run test:coverage`
- `npm run lint:errors`

## CI Enforcement

- Workflow: `.github/workflows/test.yml`
- PR and `main` pushes now run `npm run test:app` before coverage, making app-level journeys a required gate.
