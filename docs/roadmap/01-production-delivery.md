# 1. Reliable production cache delivery

Status: partial; prerequisite [PR #103](https://github.com/metalfurius/gym/pull/103) merged and v2.8.4 deployed.
Token/policy repair, real purge and two full canonical sweeps passed. The installed old-client journey and
two-judge closure review remain open. [Original evidence](../production-cache-evidence-2026-11-20.md).
The subsequent v2.8.5 publication passed the same exact-deployment/purge/two-sweep workflow on November 27;
[latest evidence](../maintenance-evidence-2026-11-27.md) preserves the installed-client limitation.
The starting-point observations below describe the original v2.8.3 / `d4c6d0d` baseline.
Follow the [shared review protocol](README.md#two-judge-merge-protocol).

## Starting point and preserved behavior

`scripts/cloudflare-cache-control.mjs` resolves `codeoverdose.es`, checks the configured account, verifies an
account token, reconciles a fixed Gym bypass rule and purges canonical URLs declared by the deployed manifest.
`.github/workflows/cloudflare-cache.yml` uses the `production` environment. Its observed 403/9109 remains a real
access failure despite the secret existing. Never infer its token type, permissions or correct account from that fact.
`_headers` expresses cache intent; verify actual served headers instead of assuming the host applies it.

Authenticated account inspection found no active account/user API tokens. Live rule inspection also confirmed
that the existing Gym bypass precedes a broad `Cache Everything` rule and is overridden: the last matching rule
wins. The script inserts a missing rule before the first rule and does not reorder a matching existing rule.
This is a confirmed precedence defect; credential repair alone does not resolve delivery.

The workflow currently follows `Create Release`, which can finish before Pages deployment, and checks out moving
`main` for its control plane. Gym's smoke accepts one successful sweep, while portfolio has repeated verification.
Preserve `release-updater`, worker staging/hash checks, session backups, stale-CDN rejection and `actualizar.html` recovery.

## Ordered implementation

1. Capture the failing workflow step and API path/status/code without secrets. Confirm the zone owner account,
   token ownership/type, expiry, IP restrictions and capabilities against current official documentation.
   Renew/configure the production secret through the authorized account; confirm `CLOUDFLARE_ACCOUNT_ID` matches
   the resolved zone. Test the selected token type with its documented verification endpoint, zone discovery,
   cache-rule read/write and scoped purge. Do not bypass checks or replace failure with a warning.
2. Bind control-plane checkout, target checkout, expected revision and artifacts to immutable SHAs. Wait for the
   successful `github-pages` deployment whose **deployment SHA equals the intended target SHA**, inspecting its
   actual status through the deployments API. A successful `Create Release`, latest deployment of another SHA,
   fixed sleep, or HTTP 200 is insufficient. Time out/fail with a diagnostic if readiness cannot be established.
3. Serialize cache delivery per target/environment and reject a superseded deployment before purge and before
   success. An older run must never purge or validate the newer release against its older manifest. Keep Gym and
   portfolio target scope explicit. Link deployment ID/status, workflow head, target SHA and expected revision.
4. Retain URL scope checks and targeted purge batches. Place the fixed `/gym/` bypass after conflicting broad
   cache rules, and reconcile order even when its fields already match. Verify returned rule ordering and effective
   policy; preserve unrelated rule definitions. Confirm purge operation IDs. Add create/existing/reorder tests
   including the observed `Cache Everything` order; do not grant unrelated permissions to hide a 403.
5. Extend Gym smoke to require at least **two consecutive complete successful sweeps**, separated by a recorded
   interval, of `/gym/`, `index.html`, `manifest.json`, `release.json`, `sw.js` and every declared cached asset.
   No query, fragment or cache-busting URL may supply canonical evidence. Require expected revision, manifest
   agreement, worker revision, every non-HTML hash and normalized shell agreement in both sweeps. A failed or
   divergent sweep resets consecutive success; retries cannot turn a disagreement into omitted evidence.
6. Execute the real workflow for the exact deployed revision. Then update a client installed on the previous
   release with a populated in-progress workout: activate normally, compare exact workout contents, close/reopen
   offline, reconnect and verify one persisted session after save/retry. Do not clear storage, reinstall the app,
   unregister the worker, use a fresh profile, or use the emergency page as the primary update proof.

## Completion criteria and evidence

| ID    | Required result                                                                          | Evidence                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0-01 | Correct account/token performs the real capability checks and purge; 403/9109 resolved   | Production run URL, redacted account/zone relationship, token-type verification result, rule ref and purge IDs; no token value                                                       |
| P0-02 | Purge is tied to a successful matching deployment and stale concurrent runs cannot win   | Tests for pending/failure/wrong-SHA/superseded cases; actual deployment ID/SHA and ordered workflow timestamps                                                                       |
| P0-03 | Two complete canonical sweeps agree with the exact expected deployed revision            | JSON for each URL in each sweep: UTC time, final no-query URL, status, selected cache headers, revision/hash and verdict                                                             |
| P0-04 | Installed old client updates and preserves its workout through offline restart/reconnect | Browser/OS/install mode, old/new controller revisions, before/after field comparison, screenshots/logs and single saved session ID                                                   |
| P0-05 | Integrity and stale-CDN safeguards still fail closed                                     | Focused `cloudflare-cache-control`, `service-worker-release`, `release-integrity`, `release-updater` tests; stale/mixed asset negative case; shared gates and Chromium upgrade smoke |
| P0-06 | Documentation distinguishes deploy, purge, canonical and installed-client outcomes       | Accurate README/roadmap with linked production evidence; no completion claim while any preceding criterion is blocked                                                                |

Add deterministic request-sequence tests for deployment readiness, concurrency and repeated Gym sweeps, including
one good sweep followed by an old manifest. Mocked API success is regression evidence only; P0-01/03/04 require
the real service/client. Also run the portfolio regressions because the control script is shared.

## Merge and operational closure

Every prerequisite implementation needs **two independent GPT-6.1-Sol xhigh approvals of the same final SHA**.
If `main`-only execution requires an initial workflow merge, declare P0-01/03/04 pending and keep this objective
open. After executing them, submit the closure record and evidence for both judges again. CI or a successful
Pages deployment alone cannot close it. Available account access does not complete credential/policy repair or
prove a real purge; if access becomes unavailable, record that dependency without closing the objective.

Token and policy decisions must be rechecked against [account-owned token guidance](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/),
[token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/),
[Cache Rules API guidance](https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/) and
[purge guidance](https://developers.cloudflare.com/cache/how-to/purge-cache/); these explain capabilities, not proof that this account is configured correctly.
