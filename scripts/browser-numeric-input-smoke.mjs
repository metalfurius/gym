#!/usr/bin/env node
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { browserEvidenceDirectory, runBrowserFixture } from './browser-fixture-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUESTED_BROWSER = (process.env.NUMERIC_SMOKE_BROWSER || 'chromium').toLowerCase();
const SUPPORTED_BROWSERS = new Set(['all', 'chromium', 'firefox']);

const smokeFixture = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Gym numeric input smoke</title>
  <link rel="stylesheet" href="./css/user-weight.css">
  <style>
    :root { --input-bg: #fff; --error-color: #b91c1c; --spacing-md: 1rem; }
    body { font: 16px system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; }
    main { display: grid; gap: 1rem; }
    .set-row { display: grid; gap: .5rem; }
    input, select, button { font: inherit; padding: .5rem; }
    #status { min-height: 1.5rem; }
  </style>
</head>
<body>
  <main>
    <h1>Gym numeric input smoke</h1>
    <form id="session-form">
      <div class="user-weight-input">
        <label for="user-weight">Body weight</label>
        <input id="user-weight" name="user-weight" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*">
      </div>
      <div class="set-row">
        <label for="weight">Set weight</label>
        <input id="weight" name="weight" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*">
        <label for="reps">Repetitions</label>
        <input id="reps" name="reps" type="text" inputmode="numeric" pattern="[0-9]*">
        <label for="load-type">Load type</label>
        <select id="load-type" name="load-type">
          <option value="external">External</option>
          <option value="bodyweight">Bodyweight</option>
        </select>
      </div>
      <button id="save" type="submit">Save</button>
      <p id="status" role="status" aria-live="polite"></p>
    </form>
  </main>
  <script type="module">
    import {
      normalizeDecimalEditValue,
      normalizeIntegerEditValue
    } from './js/utils/numeric-input.js';
    import {
      replaceInputValuePreservingSelection,
      setInputValidationState
    } from './js/utils/input-validation.js';
    import {
      LIMITS,
      getValidationMessage,
      validateReps,
      validateUserWeight,
      validateWeight
    } from './js/utils/validation.js';

    const form = document.getElementById('session-form');
    const userWeight = document.getElementById('user-weight');
    const weight = document.getElementById('weight');
    const reps = document.getElementById('reps');
    const loadType = document.getElementById('load-type');
    const status = document.getElementById('status');

    function signedLoad() {
      return loadType.value === 'bodyweight';
    }

    function weightLimits() {
      return { min: signedLoad() ? -LIMITS.WEIGHT.max : LIMITS.WEIGHT.min, max: LIMITS.WEIGHT.max };
    }

    function updateUserWeight() {
      const editResult = normalizeDecimalEditValue(userWeight.value);
      if (editResult.isValid) {
        replaceInputValuePreservingSelection(userWeight, editResult.value);
        setInputValidationState(userWeight, { isValid: true });
        return;
      }

      const result = validateUserWeight(userWeight.value);
      setInputValidationState(userWeight, {
        isValid: false,
        message: getValidationMessage(result, 'userWeight', LIMITS.USER_WEIGHT)
      });
    }

    function commitUserWeight() {
      const result = validateUserWeight(userWeight.value);
      if (result.isValid) {
        replaceInputValuePreservingSelection(userWeight, result.value === null ? '' : String(result.value));
        setInputValidationState(userWeight, { isValid: true });
        return;
      }

      setInputValidationState(userWeight, {
        isValid: false,
        message: getValidationMessage(result, 'userWeight', LIMITS.USER_WEIGHT)
      });
    }

    function updateWeight() {
      const editResult = normalizeDecimalEditValue(weight.value, { allowSign: signedLoad() });
      if (editResult.isValid) {
        replaceInputValuePreservingSelection(weight, editResult.value);
        setInputValidationState(weight, { isValid: true });
        return;
      }

      const result = validateWeight(weight.value, { allowSigned: signedLoad(), ...weightLimits() });
      setInputValidationState(weight, {
        isValid: false,
        message: getValidationMessage(result, 'weight', weightLimits())
      });
    }

    function commitWeight() {
      const result = validateWeight(weight.value, { allowSigned: signedLoad(), ...weightLimits() });
      if (result.isValid) {
        replaceInputValuePreservingSelection(weight, result.value === null ? '' : String(result.value));
        setInputValidationState(weight, { isValid: true });
        return;
      }

      setInputValidationState(weight, {
        isValid: false,
        message: getValidationMessage(result, 'weight', weightLimits())
      });
    }

    function updateReps() {
      const editResult = normalizeIntegerEditValue(reps.value);
      if (editResult.isValid) {
        replaceInputValuePreservingSelection(reps, editResult.value);
        setInputValidationState(reps, { isValid: true });
        return;
      }

      const result = validateReps(reps.value);
      setInputValidationState(reps, {
        isValid: false,
        message: getValidationMessage(result, 'reps', LIMITS.REPS)
      });
    }

    function commitReps() {
      const result = validateReps(reps.value);
      if (result.isValid) {
        replaceInputValuePreservingSelection(reps, result.value === null ? '' : String(result.value));
        setInputValidationState(reps, { isValid: true });
        return;
      }

      setInputValidationState(reps, {
        isValid: false,
        message: getValidationMessage(result, 'reps', LIMITS.REPS)
      });
    }

    userWeight.addEventListener('input', updateUserWeight);
    userWeight.addEventListener('blur', commitUserWeight);
    weight.addEventListener('input', updateWeight);
    weight.addEventListener('blur', commitWeight);
    reps.addEventListener('input', updateReps);
    reps.addEventListener('blur', commitReps);
    loadType.addEventListener('change', () => {
      weight.pattern = signedLoad() ? '[+-]?[0-9]*[.,]?[0-9]*' : '[0-9]*[.,]?[0-9]*';
      updateWeight();
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      commitUserWeight();
      commitWeight();
      commitReps();
      status.textContent = form.checkValidity() ? 'saved' : 'blocked';
    });

    window.__numericInputSmokeReady = true;
    window.runNumericInputSmoke = () => {
      const dispatch = (input, value, eventName = 'input') => {
        input.value = value;
        input.dispatchEvent(new Event(eventName, { bubbles: true }));
      };
      const inputState = input => ({
        value: input.value,
        ariaInvalid: input.getAttribute('aria-invalid'),
        describedBy: input.getAttribute('aria-describedby')
      });

      const incremental = ['6', '62', '62.', '62.5'].map(value => {
        dispatch(weight, value);
        return weight.value;
      });
      dispatch(weight, '62,');
      const commaWeight = weight.value;
      dispatch(weight, '62.55', 'input');
      dispatch(weight, weight.value, 'blur');
      const roundedWeight = weight.value;

      dispatch(loadType, 'bodyweight', 'change');
      dispatch(weight, '-12,5');
      const signedWeight = weight.value;
      dispatch(weight, weight.value, 'blur');
      const committedSignedWeight = weight.value;

      dispatch(userWeight, '75,4');
      const commaUserWeight = userWeight.value;
      dispatch(userWeight, userWeight.value, 'blur');
      const committedUserWeight = userWeight.value;

      const invalidReps = ['8.5', '8,5', '1e2', '+8', '-1'].map(value => {
        dispatch(reps, value);
        return { value: reps.value, ariaInvalid: reps.getAttribute('aria-invalid') };
      });
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const blockedSubmit = { status: status.textContent, valid: form.checkValidity() };

      dispatch(reps, '8');
      dispatch(reps, reps.value, 'blur');
      const correctedReps = inputState(reps);

      dispatch(reps, '8.5');
      const invalidError = document.getElementById('reps-error');

      return {
        incremental,
        commaWeight,
        roundedWeight,
        signedWeight,
        committedSignedWeight,
        commaUserWeight,
        committedUserWeight,
        invalidReps,
        blockedSubmit,
        correctedReps,
        invalidError: {
          role: invalidError?.getAttribute('role'),
          live: invalidError?.getAttribute('aria-live'),
          hidden: invalidError?.hidden,
          text: invalidError?.textContent
        },
        controls: {
          weightType: weight.type,
          weightInputMode: weight.inputMode,
          repsType: reps.type,
          repsInputMode: reps.inputMode,
          repsPattern: reps.pattern,
          weightLabel: document.querySelector('label[for="weight"]')?.textContent,
          repsLabel: document.querySelector('label[for="reps"]')?.textContent
        }
      };
    };
  </script>
</body>
</html>`;

function contentType(filePath) {
    return (
        {
            '.css': 'text/css; charset=utf-8',
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
        }[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    );
}

async function createSmokeServer() {
    const server = createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
            if (requestUrl.pathname === '/numeric-input-smoke.html' || requestUrl.pathname === '/') {
                response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
                response.end(smokeFixture);
                return;
            }

            const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
            const filePath = path.resolve(ROOT, relativePath);
            if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
                response.writeHead(403);
                response.end('Forbidden');
                return;
            }

            const body = await fs.readFile(filePath);
            response.writeHead(200, {
                'Cache-Control': 'no-store',
                'Content-Type': contentType(filePath),
                'Service-Worker-Allowed': '/',
            });
            response.end(body);
        } catch (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500);
            response.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
        }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return { server, url: `http://127.0.0.1:${address.port}/numeric-input-smoke.html` };
}

function assertSmokeState(result) {
    const state = result.state;
    const expectedIncremental = ['6', '62', '62.', '62.5'];
    if (JSON.stringify(state.incremental) !== JSON.stringify(expectedIncremental)) {
        throw new Error(`${result.browser}: incremental weight editing changed unexpectedly`);
    }
    if (state.commaWeight !== '62.' || state.roundedWeight !== '62.6') {
        throw new Error(`${result.browser}: decimal comma/precision contract failed`);
    }
    if (state.signedWeight !== '-12.5' || state.committedSignedWeight !== '-12.5') {
        throw new Error(`${result.browser}: signed bodyweight contract failed`);
    }
    if (state.commaUserWeight !== '75.4' || state.committedUserWeight !== '75.4') {
        throw new Error(`${result.browser}: user bodyweight decimal contract failed`);
    }
    const expectedInvalidReps = ['8.5', '8,5', '1e2', '+8', '-1'];
    if (
        !Array.isArray(state.invalidReps) ||
        state.invalidReps.length !== expectedInvalidReps.length ||
        state.invalidReps.some(
            (entry, index) => entry.value !== expectedInvalidReps[index] || entry.ariaInvalid !== 'true'
        )
    ) {
        throw new Error(`${result.browser}: malformed repetitions were not retained and marked invalid`);
    }
    if (state.blockedSubmit.status !== 'blocked' || state.blockedSubmit.valid !== false) {
        throw new Error(`${result.browser}: invalid repetitions did not block submit`);
    }
    if (state.correctedReps.value !== '8' || state.correctedReps.ariaInvalid !== null) {
        throw new Error(`${result.browser}: valid repetition correction did not clear validation`);
    }
    if (
        state.invalidError.role !== 'alert' ||
        state.invalidError.live !== 'polite' ||
        state.invalidError.hidden !== false ||
        !state.invalidError.text
    ) {
        throw new Error(`${result.browser}: accessible error message contract failed`);
    }
    if (
        state.controls.weightType !== 'text' ||
        state.controls.weightInputMode !== 'decimal' ||
        state.controls.repsType !== 'text' ||
        state.controls.repsInputMode !== 'numeric' ||
        state.controls.repsPattern !== '[0-9]*' ||
        !state.controls.weightLabel ||
        !state.controls.repsLabel
    ) {
        throw new Error(`${result.browser}: numeric input accessibility attributes failed`);
    }
}

async function run() {
    if (!SUPPORTED_BROWSERS.has(REQUESTED_BROWSER)) throw new Error('NUMERIC_SMOKE_BROWSER must be chromium, firefox, or all');
    const evidenceDirectory = browserEvidenceDirectory('numeric-input');
    const smokeServer = await createSmokeServer();
    const failures = [];
    try {
        for (const kind of REQUESTED_BROWSER === 'all' ? ['chromium', 'firefox'] : [REQUESTED_BROWSER]) {
            try {
                await runBrowserFixture({ name: 'numeric-input', kind, url: smokeServer.url, evidenceDirectory,
                    readiness: 'window.__numericInputSmokeReady === true', expression: 'window.runNumericInputSmoke()', assertState: assertSmokeState });
            } catch (error) { failures.push(error); }
        }
    } finally {
        smokeServer.server.closeAllConnections();
        await new Promise(resolve => smokeServer.server.close(resolve));
    }
    if (failures.length) throw new Error(failures.map(error => error.message).join('; '));
}

run().catch(error => { console.error(`[numeric-input] ${error.stack || error.message}`); process.exitCode = 1; });
