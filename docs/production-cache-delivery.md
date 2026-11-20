# Production cache delivery runbook

This tooling is a prerequisite for roadmap objective 1. Its merge does not complete P0-01, P0-03 or P0-04.
Real Cloudflare capability/purge evidence, repeated production coherence and the installed-client workout
journey remain separate operational gates. Unit fixtures do not satisfy them.

## What the workflow proves

`Purge and Verify Canonical Cache` runs in the `production` environment. Automatic runs follow a successful
`Create Release`; they then wait for the actual `github-pages` deployment of that release workflow's full
head SHA. A release workflow finishing, an unrelated successful deployment or a delay never establishes readiness.

The workflow checks out its control plane at immutable `github.sha`, and its selected target at the supplied
full commit SHA. `production-cache-delivery.mjs` checks both checkout heads, reads the expected application
revision from that exact target manifest, and rejects a conflicting manual `expected_revision` input.
Gym uses `target-gym/release.json`; portfolio uses `target-portfolio/site-revision.json`.

Delivery jobs serialize by fixed target and production environment. The selected repository's current `main`
must still equal the intended target SHA. The newest `github-pages` deployment must be for that SHA, and its
latest deployment status must be `success`. Readiness polls for up to ten minutes; failure/error/inactive
statuses, superseded targets and freshness regressions fail closed. A new deployment ID after readiness is
also rejected, even when it names the same SHA. The checks repeat before every purge batch, every canonical
sweep and final success. The script cannot atomically lock GitHub Pages and Cloudflare together; a deployment
starting between external API calls is detected at the following guard and prevents a passing delivery result.

The fixed target bypass is appended after enabled cache-settings rules. Existing matching fields are insufficient:
the script also repairs a shadowed rule's position and reads back the complete entrypoint to verify precedence.
Only the selected fixed rule is created/updated/moved; unrelated rule definitions are preserved. Cloudflare documents
that [the last matching cache rule wins](https://developers.cloudflare.com/cache/how-to/cache-rules/order/) and
supports [moving a rule to the end with `position.after: ""`](https://developers.cloudflare.com/ruleset-engine/rulesets-api/update-rule/).
Every targeted purge batch must return an operation ID.

Both targets need two consecutive complete, separately validated canonical sweeps, with a recorded five-second
interval in CI. Gym checks its root, index, manifest, release metadata, exact checked-out worker hash/revision,
and every declared cached asset. Both shells must agree after the established Cloudflare markup normalization.
Every non-HTML declared asset must match its manifest hash. Portfolio retains its fixed content-addressed CSS/JS,
media and shell checks in both sweeps. Cross-sweep fingerprints must also remain stable. A failed/mixed/divergent
sweep resets the count; the recorded attempt remains in the evidence. Query/fragment URLs and redirects away
from the exact requested canonical URL cannot supply evidence. Request cache-control headers alone prove nothing.
The isolated challenge browser disables both its HTTP cache and service-worker interception before navigating.
An active application worker therefore cannot substitute a cached response originally fetched with a query URL.

## Authorized production execution

1. Before deploying a new application revision, retain an already-installed previous-release client with a
   populated workout in progress. Capture its controller revision and all workout fields for later comparison.
2. Merge only the exact candidate approved independently by the two required judges. Workflow-only changes may
   need a manual dispatch because `Create Release` is filtered to application release files.
3. Configure the authorized account-owned Cloudflare token through the production environment secret
   `CLOUDFLARE_CACHE_API_TOKEN`. Check the zone owner and optional non-secret `CLOUDFLARE_ACCOUNT_ID` variable.
   The existing account-token verification, zone discovery, cache-rule write/read and scoped-purge checks are
   required. A stored secret, login session or HTTP 403/9109 is not proof of working capabilities. Do not print
   credentials or replace an authorization error with a warning. If a different token ownership type is chosen,
   review its documented verification flow before changing the account-token contract.
4. Dispatch the workflow from `main`, selecting `gym` or `portfolio`, the selected repository's full current
   `main` SHA, and that checkout's exact manifest revision. Arbitrary hosts/repositories and historical releases
   are intentionally unsupported. Let the readiness gate wait for matching Pages success.
5. Download `canonical-cache-<target>-<target SHA>-control-<control SHA>`. Inspect its JSON status and checks;
   retain its immutable workflow/artifact URL with the full reviewed, merged, deployed and control SHAs. A failed
   run writes `status: failed`; an earlier evidence file is removed before execution. No passed delivery artifact
   is written until the final freshness guard succeeds.
6. Record the actual account/zone relationship without credentials, deployment ID/status, purge operation IDs,
   expected release revision and UTC ordering. Each sweep contains every URL, HTTP status, final URL, cache
   headers, content hash, fetch timestamp and verdict. An unfetched response is explicitly marked `not-fetched`.
   Compare both complete successful sweeps; preserve intervening failures instead of omitting them.
7. Complete the installed-client journey below. Keep the objective open until its live closure evidence receives
   the same two-judge review as the implementation.

The public `npm run cloudflare:cache:purge` command delegates to the same guarded coordinator. Local execution
requires full `DEPLOYMENT_CONTROL_SHA` and `DEPLOYMENT_TARGET_SHA`, `GITHUB_TOKEN` with deployment read access,
the scoped Cloudflare secret, and the fixed sibling target checkout. Prefer the production workflow so execution
and artifacts share one audit trail. A standalone `production:release:smoke` validates the local Gym checkout by
default; it is canonical-only evidence and cannot prove deployment readiness or a purge.

## Installed-client evidence still required

Use the retained previous-release installation and its existing profile/storage. Record browser, OS, install
mode, old/new controller revision and UTC times. Activate the offered update normally, compare every workout
field before/after, close and reopen offline, then reconnect. Save/retry and verify one persisted session ID
with the original workout contents. Retain redacted screenshots/logs and the exact field comparison.

Do not clear site data, reinstall, unregister the worker, use a fresh profile or use `actualizar.html` as the
primary update proof. Deployment success, confirmed purge, canonical coherence and an installed-client update
are four different results; record each as passed/failed/blocked/not run. An unavailable old installation keeps
P0-04 open.

## Regression checks

Run the focused suites for `cloudflare-cache-control`, `github-pages-deployment`, `production-cache-delivery`,
`production-release-smoke`, `service-worker-release`, `release-integrity` and `release-updater`. They exercise
real helper orchestration with deterministic API/asset sequences, including pending/failing/wrong-SHA/stale
deployments, shadowed cache rules and a good sweep followed by an old manifest. Run the shared lint/no-skips,
application/offline and coverage gates. An application asset change additionally needs release integrity and
Chromium upgrade smoke. Live Cloudflare/installed-client results must be recorded separately from these fixtures.
`npm run test:e2e:canonical-transport` additionally uses real Chromium and an active worker to verify network
request counts, current/stale canonical response bodies and rejection of a query-backed cache response. CI runs it.
