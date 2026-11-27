# Objective 2 integration with published maintenance

Local integration record; **not backend acceptance, publication or objective closure**.
The parent rebased the V3 checkpoint `d4667d800f92a07271052238df0869b705b70f69` onto published
maintenance/evidence main `3cf38202e5974acf97d0b2926ca365acf7019eba`, producing checkout
`08ae9fcfcf487fa9d28876c55bd3ea3492da3534` before these integration changes.
The V3 author record remains historical and unchanged by this integration.

Resolved conflicts preserve the union of evidence attributes and the modern main testing guide plus the outbox
commands. Generated intermediate release metadata was replaced and regenerated at the end. Comparison with the
V3 checkpoint shows only the three already-reviewed maintenance repairs in product JavaScript: `ui.js`,
`routine-import.js` and `session-variant-overrides.js`; the six native-smoke core hashes are unchanged.

Prepared revision is **v2.8.6, 75 cached assets**, not a published release. The parent added a required hosted
negative cleanup step next to the positive outbox smoke, with both outputs under the existing uploaded artifact.
The new ESLint 10 gate found one unnecessary escape inside a browser-fixture regular-expression character
class; removing it preserves the expression's meaning. No linter rule or coverage gate was relaxed.

Executed on Windows / Node 24.12.0 after `npm ci --ignore-scripts`:

| Check | Actual result |
| --- | --- |
| Zero-warning lint ratchet | Passed with ESLint 10 |
| No-skips | Passed |
| Full gated coverage | 73 suites / 1,072 tests passed; statements 80.62%, floor 70% |
| App gate | Six suites / six journeys passed |
| Offline gate | Two suites / two journeys passed |
| Release integrity / two-build check | Passed, v2.8.6 → fixture v2.8.7, 75 cached assets |
| Actual Chromium outbox / native localStorage and IndexedDB | Passed, Chrome for Testing 158.0.8127.36; SDK transport synthetic |
| Real cleanup-negative child | Verifier passed: child exit 1, failed result JSON, matching trace, later server cleanup observed |
| Actual Chromium two-version upgrade | Passed with preserved in-progress fixture, offline restart and reconnect |
| Updated workflow syntax | Parsed; positive and required negative steps found, no continue-on-error |

The main install reports 18 moderate vulnerabilities, matching the accepted maintenance dependency tree.
Raw logs and browser traces remain under `C:/tmp/gym-roadmap-02-main6-*`; committed text normalizes CRLF to LF,
trims console trailing padding and redundant final blank lines. `source-manifest.json` hashes canonical Git
source/artifact bytes with BOM preserved and records external trace hashes. Browser JSON identifies checkout
08ae9fc plus the six actual source hashes; it is not relabeled as an already committed review head.

Hosted checks and both independent exact-head reviews must run on the subsequent frozen commit. The actual
strict backend rules, administrator-owned global attestation and final real-service two-client/device acceptance
are still open. An unavailable backend must not be replaced with the synthetic SDK results above. Do not merge
or publish this client implementation on the strength of this local record alone.
