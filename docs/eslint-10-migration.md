# ESLint 10 migration plan and review boundary

Status: implementation in progress, November 27, 2026. This is the explicit major-toolchain migration within
objective 4, separate from the compatible dependency checkpoint `a096162b045a39576d84e629539f8919e5eb920e`
on browser-gates main `88f95151f104df58d87e751984de6cd0c5de28d4`. Neither checkpoint nor earlier browser
approvals approve this migration. The final change requires its own two independent identical-head reviews.
QA-05 remains open until physical Safari/Home Screen PWA evidence exists.

## Reason and compatibility

[ESLint's support table](https://eslint.org/version-support/) lists both v8 and v9 as end of life and v10 as
current. The [v10 migration guide](https://eslint.org/docs/latest/use/migrate-to-10.0.0) removes eslintrc support
and requires Node 22.13+ on the project's Node 22 CI line. The locked candidate uses ESLint 10.15.0,
`@eslint/js` 10.0.1 and `globals` 17.14.0. Local acceptance and CI use Node 22; no deprecated runtime fallback
or `ESLINT_USE_FLAT_CONFIG=false` is part of the migration.

The old `semi`, `quotes`, `indent`, `comma-dangle` and `arrow-spacing` policies move to the maintained
`@stylistic/eslint-plugin` 6.0.1 equivalents with the same policy/severities, following its
[migration guidance](https://eslint.style/guide/migration). Its optional oxlint peer is not needed or installed.
Stylistic 6 replaces the old quotes option `allowTemplateLiterals: true` with `allowTemplateLiterals: 'always'`;
the [quotes documentation](https://eslint.style/rules/quotes) confirms the equivalent allowance.
The full current recommended correctness rules remain enabled, including v10's new unassigned-variable,
useless-assignment and caught-error rules. Reports are repaired rather than disabled to obtain a green run.

## Implementation contract

1. Replace `.eslintrc.cjs` with `eslint.config.mjs`. Preserve the existing browser/Node/Jest and Firebase/Chart
   globals and explicit custom rules; preserve CommonJS handling for `.cjs`.
2. Lint authored `.js`, `.cjs` **and `.mjs`** files, including every browser/process/sandbox helper merged in
   PR107. Exclude dependency/build/coverage/generated temporary outputs, not authored problem files.
3. Keep `lint:ratchet` at zero warnings and keep `lint:errors` available for app journeys. Add executable
   negative probes of the actual linter for supported extensions, correctness rules and warning rejection.
4. Inspect all necessary source repairs for behavioral equivalence. No application feature or UI change is
   authorized by this migration. A repair requiring a behavioral decision must be reported separately.
5. Preserve no-skipped-tests and the >=70% statement coverage policy. Verify Jest/JUnit output and browser
   helpers under Node 22, then run the complete shared gates against the integrated candidate.
6. Refresh release metadata only if cached asset bytes change; tooling-only edits do not require a product
   version bump. Required generated metadata cannot be omitted if source repairs touch cached assets.

## Acceptance and rollback

Acceptance requires clean `npm ci`, linter probes and repository ratchet, app/offline tests, coverage gate,
release integrity and existing browser jobs, plus green CodeQL on the final reviewed head. Record exact tool
versions, command exits, remaining audit findings and CI links in the maintenance review record. Formatting
remains advisory; this migration must not represent it as a new merge requirement.

If configuration/plugin compatibility or behavioral equivalence cannot be established, keep this major
migration unmerged. Its dedicated changes can be reverted without discarding the preceding compatible
dependency checkpoint or the already merged browser gates. Do not silently fall back to an end-of-life linter
or disable newly failing rules. PR67/70 remain open until their reviewed replacement is merged and linked.
