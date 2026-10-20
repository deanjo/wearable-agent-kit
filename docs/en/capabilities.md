# Capabilities and boundaries

**Use one local, trusted user's data; preserve evidence about what was actually read.** The MCP layer exposes the kit to an agent. It is neither a vendor-provided MCP service nor a credential store.

## Source routes

| Source | Route | Important boundary |
|---|---|---|
| WHOOP | Official OAuth and documented API | Requires your own approved application configuration and user consent. Available summaries are not raw sensor waveforms. |
| Garmin | Unofficial personal Garmin Connect integration | International/global account only in this release; China-region access is not implemented. Separate from the official developer program; upstream changes matter. |
| Synthetic | Local fixtures | Safe for onboarding and regression tests; never evidence of real health or live connectivity. |

Provider libraries can be used independently of MCP. The default entry points use synthetic data. Live operation requires explicit opt-in and local authorization; the MCP tool never accepts passwords or tokens.

## Coverage is part of the result

- Distinguish provider measurement time, provider update time, and retrieval time.
- Garmin heart rate is a set of synchronized discrete samples. Preserve valid point count, time range and gaps; do not invent continuous coverage.
- Activity pagination is bounded: page size 20, at most 10 activity requests, 200 scanned records, and a 30-second activity request budget. A retry consumes a request. Reaching any bound may leave omissions.
- `api_pagination_exhausted` means the upstream date query reached an empty page. Device synchronization remains `unknown`; list snapshot consistency remains `not_guaranteed`.
- Repeated pages, no progress, failures, and limits must remain visible in status/reason. Empty results do not prove no exercise.
- WHOOP currently reads a rolling seven-day window. Garmin defaults to yesterday in the configured timezone; only live Garmin reads accept `--day`. Check actual record dates before comparing sources.
- Fixed/configured date boundaries are explicit. Never infer account timezone from IP address or current device display.

## From records to reports

The CLI/MCP output includes source data and descriptive observed-sample heart-rate statistics. The connected agent is responsible for question-specific interpretation and a readable report, subject to user authorization and provider terms. A model can analyze supplied history without retaining it. A long-term archive, retention policy, cross-device reconciliation, and recurring report delivery are separate work, not features enabled by cloning the kit.

## Deliberately outside the first release

No public multi-user hosting, vendor-endorsed MCP, continuous raw heart-rate waveform, minute-by-minute sleep-stage guarantee, device synchronization guarantee, diagnostic assessment, or built-in scheduled delivery. A runtime adapter and safe identity/secret boundaries are needed to connect a remote agent platform. Copying a local configuration does not provide those boundaries.

See [validation](../validation.md) for the precise tested level and [analysis guide](analysis-guide.md) for evidence-aware reporting.
