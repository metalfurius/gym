# Actual sync backend deployment, November 27, 2026

This is an operational prerequisite record, **not acceptance of the unmerged client or closure of objective 2**.
The source deployed is the exact rules implementation approved independently by both GPT-6.1-Sol xhigh
judges in PR #108: `feef930ea9cae7184e5141175b47a0d9b47de8fe`. It is unchanged in published main
`3cf38202e5974acf97d0b2926ca365acf7019eba` and the current sync client branch.

| Step | Observed result |
| --- | --- |
| Current administrator session | Existing user-authorized Chrome debugging connection; Firebase Console project `gymm-178fb`, `(default)` database |
| Fresh preimage backup | Release `cloud.firestore`, ruleset `63a88712-c7d7-4f7e-973c-eb7cf2aba872`, source SHA-256 `33409d46ecebf0f048c4eb4586af51ca09196af9b961bec30df80ceb8e2fe906` |
| Exact source entered | Editor document compared byte-for-byte with approved rules; SHA-256 `b177634716de15d1d320ffe07f28f2581a6198a57ec7aef8d90ecc9977805504`, no compiler diagnostic |
| Publish / server readback | Ruleset `6ad50078-80c5-4675-8590-e4c1241d3770`; release `updateTime` **2026-11-27T15:39:06.753907Z**; Rules API source equals approved bytes |
| Propagation before activation | Fresh real authenticated synthetic client reads global policy: **404**, rather than the previous rules' denied read; own UID policy and counter both **404**; zero writes by probe |
| Administrator activation | Created only `runtime_config/sync_protocol`, exactly `{version:1, epoch:"gym-sync-v1-2026-11"}`, after the source/readback/propagation checks; initiation recorded **15:42:52.474 UTC** |
| Independent client readback | Real Firebase authenticated REST **200**, exact typed integer/string fields; UID policy/counter still absent; zero writes by probe |

The [evidence directory](../Validation%20Evidence/2026-11-27-sync-backend-deployment/checksums.json) retains
the current preimage, immutable published ruleset source, deployment metadata, pre-activation propagation
observation, administrator activation record, real client readback and console screenshot. Text is canonical
LF; the screenshot is unchanged binary. No authentication headers, cookies, access tokens or passwords are
included. The synthetic account identifier names the designated QA owner, not another user's data.

Only the already-reviewed base sync fence was deployed. Saved-workout editing rules from the unmerged
objective-6 branch were **not** deployed. No user workout, preference, UID activation marker, session revision
or mutation receipt was created or changed by these administrative actions. Existing UID markers must never
be reset to admit a legacy writer. The global attestation enables subsequent clients to verify and activate
their own UID protocol atomically; it does not replace that per-account check.

The public client remains v2.8.5. Final sync client code, both exact-head independent reviews and the real
two-machine application sequence remain pending. The local Windows/native SDK-fixture tests are separate
from these actual server observations. Actual Safari/iOS and an old OS-installed client update also remain
separate requirements; this backend record does not satisfy them.
