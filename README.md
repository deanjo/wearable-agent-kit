# Wearable Agent Kit

[简体中文](README.zh-CN.md)

**Give an agent a reproducible path from wearable data to an evidence-aware summary.** Start offline, authorize locally, read WHOOP or Garmin, and preserve what is known about dates, freshness, and missing records.

The reusable parts are provider libraries, local encrypted state, checkpoint recovery, and a read-only MCP interface. The teaching material explains failure modes and the evidence required before saying an integration works.

## Who it is for

Developers and agents building **single-user, self-hosted** integrations. WHOOP uses its official OAuth/API; Garmin uses an **unofficial personal Connect route**, separate from Garmin's official developer program. Neither vendor provides or endorses this project's MCP adapter.

## Shortest path: no account needed

Requires Node.js **24+**. No third-party runtime packages are required.

```sh
npm run doctor
npm run verify
```

The default path is **synthetic**. To inspect its checkpoint explicitly:

```sh
npm run collect -- --output /tmp/wak-checkpoint.json
npm run read -- --checkpoint /tmp/wak-checkpoint.json
```

For local authorization, live reads, or MCP setup, follow the [quickstart](docs/en/quickstart.md). Never send account passwords or tokens to an agent conversation.

## What counts as success

1. Offline tests pass.
2. A synthetic collection produces a checkpoint.
3. A separate process reads that checkpoint.
4. Live acceptance is recorded separately: user-authorized read, measurement times, coverage, restart recovery, and refresh behavior.

See [validation](docs/validation.md). Fake-transport tests do not verify a real account or production service. A scheduler and verified delivery are separate work.

## Architecture and limits

Agent → this project's MCP adapter → provider library → WHOOP API / Garmin Connect.

The MCP adapter is project code. WHOOP supplies its official API, not this adapter. Garmin integration includes upstream-derived code with attribution in `THIRD_PARTY_NOTICES.md`; it is not all original or an official Garmin MCP.

Each deployer keeps their own encrypted session state in an explicitly selected local directory. The vault passphrase is entered locally and is not saved with the vault. The running process can decrypt authorized state while unlocked; a compromised machine or process can therefore access it. This project supplies no central credential-hosting service. See the [quickstart](docs/en/quickstart.md) for exact local inputs.

```text
src/
  providers/        WHOOP official API; Garmin unofficial Connect
  core/             contracts and local authorization/state helpers
  analysis/         descriptive, evidence-aware summaries
  mcp/              local read-only stdio interface
scripts/            environment checks and offline verification
tests/              synthetic fixtures and regression tests
deploy/reference/   local client configuration
examples/           synthetic examples
docs/en/            quickstart, capabilities, troubleshooting, analysis guide
docs/zh-CN/         corresponding Chinese guides
```

Local stdio is the initial agent transport. Remote dot/other agent platforms need a reviewed runtime adapter and identity boundary; this is not a ready-made multi-user hosted service. No raw waveform, full-device synchronization, diagnostic advice, or punctual scheduled-delivery guarantee is made. See [capabilities](docs/en/capabilities.md).

## Find the next step

- **Agent instructions:** [AGENTS.md](AGENTS.md)
- **Login, callback, refresh, pagination, or stale tools:** [troubleshooting](docs/en/troubleshooting.md)
- **Turn records into a careful report:** [analysis guide](docs/en/analysis-guide.md)
- **Secrets and publication review:** [SECURITY.md](SECURITY.md)
- **License and upstream attribution:** [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

Review [WHOOP's API terms](https://developer.whoop.com/api-terms-of-use/) before deployment or redistribution for a specific use. Its 2026-10-06 terms restrict professional-advice uses and embedding developer credentials in open source. A disclaimer does not establish permission.
