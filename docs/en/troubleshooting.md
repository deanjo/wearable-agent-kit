# Troubleshooting: fix the boundary that failed

**Identify the failing stage before retrying.** Configuration, authorization, fetching, persistence, reporting, and delivery are different stages. Never replace a failed real read with synthetic data.

| Symptom | Smallest safe action | Evidence to require |
|---|---|---|
| Login succeeds; expected device/data absent | Verify account and China/global region explicitly. Purchase country and current location do not identify the data region. Do not repeatedly submit credentials across regions. | Expected device or a known recent record in the chosen account. |
| Login form is rejected before reaching the provider | In a browser-based deployment, inspect its own Origin/CSRF policy. A `no-referrer` page can produce `Origin: null` for a native form submission. Use an appropriate same-origin referrer policy; never accept arbitrary/null origins as a workaround. | Same-origin request succeeds; cross-origin and null-origin attacks still fail. This does not apply to the default stdio transport. |
| WHOOP callback fails despite approval | Check exact registered redirect URI, state, duplicate critical parameters, and documented additional query fields. Reject malformed security fields without blanket-rejecting harmless documented extras. | One-use state matches and callback completes without exposing a code in logs. |
| Token request redirects or runtime rejects redirect mode | Treat 3xx as a distinct error; validate endpoints and runtime behavior. Never forward credentials to an untrusted redirect target. | Redirection tests fail closed; canonical endpoint succeeds. |
| Refresh worked, then connection breaks | Prevent concurrent refresh; reconcile persisted generation before retrying. An ambiguous write or transport outcome requires a blocked state, not replay of an old token. | Locking and failure-injection tests pass; a new process reads the committed generation. |
| Tool still describes old behavior after update | Check executable path, version, client/tool-directory cache and actual returned schema. Restart/reload the client as appropriate. | Expected version plus a successful call and current coverage fields. A connected badge is insufficient. |
| Activities are missing or a list is empty | Inspect pagination status/reason and coverage. Bounds, repeated pages, no progress, errors, or unsynchronized devices may explain omissions. | Report query exhaustion separately from device synchronization and snapshot consistency. |
| “Today” contains old measurements | Compare measurement dates with update/retrieval timestamps and configured timezone. | Source-specific record times shown; stale records labeled, never renamed as today's. |
| A scheduled report arrives late or is absent | Inspect scheduled time, trigger, execution, and send status separately in the actual scheduler. | An accepted send is not a read receipt; a configured task is not proof it ran. This kit does not provide a scheduler. |

## Diagnose without leaking

Collect the package version, provider, configured region/timezone, fixed error code, pagination status, and synthetic reproduction. Omit secrets, health records, full callback URLs, raw headers, and provider bodies. Reproduce with fixtures before opening an issue.

## Live integration remains an acceptance task

A successful test using a fake transport validates code paths, not a provider account, current protocol compatibility, production storage, or long-term refresh. Follow [validation](../validation.md) before claiming live success. Garmin's personal Connect route is unofficial and can change without notice; do not bypass security controls or rate limits.
