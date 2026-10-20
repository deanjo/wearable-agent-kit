# Quickstart

**Prove the offline path first, then opt into a real account.** Use Node.js 24+ on a trusted Linux/macOS machine. Run commands from the repository root. There are no third-party runtime dependencies to install.

## 1. Offline acceptance

```sh
npm run doctor
npm run verify
npm run collect -- --output /tmp/wak-checkpoint.json
npm run read -- --checkpoint /tmp/wak-checkpoint.json
```

Expect synthetic mode and successful new-process checkpoint recovery. These commands neither log in nor read real health data. `verify` uses temporary files and removes them afterward; its printed result records the execution time and test counts.

## 2. Local authorization

Review [security](../../SECURITY.md) and applicable provider terms first. Confirm the receiving agent/model service and what it may retain before sending live health data; local MCP transport does not make inference local. The consent flag below acknowledges that review; it does not grant you additional provider permissions. Choose a **private directory outside the repository**. Vault directories/files use owner-only permissions. Use a unique passphrase of at least 12 characters.

Garmin **international/global accounts only**:

```sh
npm run auth -- --provider garmin --state-dir "$HOME/.wearable-agent-kit/garmin" --accept-provider-terms
```

Enter the vault passphrase, account email, password and any MFA code locally when prompted. Secret inputs use the controlling terminal and are hidden. The password is sent to Garmin through the authentication flow, but is not saved by this kit; authorized session state is encrypted. China-region accounts are not implemented: do not assume switching your location will make this route suitable.

WHOOP:

1. Use your own WHOOP OAuth application and register exactly `http://127.0.0.1:8787/oauth/callback` as its redirect URI.
2. Run:

```sh
npm run auth -- --provider whoop --state-dir "$HOME/.wearable-agent-kit/whoop" --accept-provider-terms
```

3. Enter your application ID and secret locally. Follow the printed authorization link in your browser and complete WHOOP's consent on its official site. Application credentials and token requests are sent to WHOOP as required by the flow. The loopback callback must reach this same machine.

Do not paste secrets into commands, chat, configuration examples or MCP arguments. Vault passphrases are not saved; a new process requires unlocking again. Provider credentials/session material needed for subsequent operations are held in the encrypted local vault. The unlocked process can decrypt them.

## 3. Minimal real read

```sh
npm run collect -- --live --provider garmin --state-dir "$HOME/.wearable-agent-kit/garmin"
npm run collect -- --live --provider whoop --state-dir "$HOME/.wearable-agent-kit/whoop"
```

Inspect `mode`, `provider`, `readAt`, actual record times, and coverage. Garmin defaults to yesterday under `Asia/Manila`; use `--timezone` with an explicit IANA zone if appropriate, and `--day YYYY-MM-DD` for an allowed date. Travel does not change it automatically. WHOOP currently uses a rolling seven-day window, not Garmin’s selected day; `--day` is accepted only for live Garmin reads and is rejected in other modes before vault unlocking. A configured timezone labels the date boundary but does not turn WHOOP’s rolling window into a local calendar day. Inspect actual record times before calling either result “yesterday.” Reads remain subject to the provider’s authorized window.

For a live Garmin checkpoint, add `--output` pointing to a private location. Live WHOOP with `--output` is rejected before reading (`WHOOP_PLAINTEXT_EXPORT_UNSUPPORTED`); encrypted WHOOP export is not implemented. Synthetic checkpoints remain available. **Checkpoints contain the readable report, not an encrypted vault.** Keep them out of Git and protect backups. For WHOOP, review the encryption and retention requirements in [security](../../SECURITY.md) before collecting or retaining data; private file permissions alone are insufficient. Blocking this export option does not encrypt terminal output, MCP results, redirected output, or client logs. Collection and read commands also print health data to the terminal; review terminal recording, redirected output, and client logs. Use a dedicated report path outside the credential directory. The CLI rejects output paths inside that directory, including resolved symlink aliases, but an allowed `--output` can still replace another existing file. This does not protect against malicious concurrent filesystem changes. A successful login alone is not a successful read.

## 4. Connect an MCP client

The default `deploy/reference/mcp.example.json` launches synthetic mode through local stdio. Replace its absolute executable path with yours. The read-only tool is `read_wearable_summary` with arguments `{}`; extra arguments, including credentials, are rejected.

```sh
npm run mcp
```

Live mode uses the same explicit provider/state options:

```sh
npm run mcp -- --live --provider garmin --state-dir "$HOME/.wearable-agent-kit/garmin"
```

Live startup needs a controlling terminal for vault unlocking. GUI clients that launch servers without a terminal are **not supported for live unlocking in this release**. Do not work around this by putting a passphrase in client configuration. Starting the server alone does not connect a client; your client must own the stdio session.

See [troubleshooting](troubleshooting.md) for blocked refresh or locks. Never remove a lock or retry an old token blindly after an interrupted refresh. See [validation](../validation.md) before claiming live or scheduled success.

## 5. Ask for an evidence-based report

First test the configured client with synthetic mode. Ask it to call `read_wearable_summary` with `{}` and label the result synthetic. Then, only after local live authorization and client setup, ask for a report with conclusion, evidence, next step, and gaps. The [analysis guide](analysis-guide.md) provides a reusable prompt and a worked synthetic report. The CLI returns structured data and descriptive statistics; it does not itself generate that natural-language report, keep a long-term history, or schedule delivery. Model analysis does not imply long-term memory: keeping an archive requires separate user authorization and a retention plan. Cloning this repository alone does not set up daily reports.

The receiving client/model may retain tool results. Review who can see its history and how long it is saved; authorization to read does not authorize forwarding reports. If you stop using the integration, stop its process, revoke access through the provider’s official settings, and review local exports, client history, and backups. The kit has no universal revocation or downstream deletion command.

### Recover a deliberately blocked connection

After reviewing an interrupted operation, WHOOP can be explicitly reauthorized using the same `auth` command and unlocked vault. Garmin currently refuses to overwrite an existing connection: use a new private `--state-dir` for a fresh, user-approved authentication. Review and archive the old vault yourself; do not automatically delete it or copy its tokens. Neither route authorizes breaking a stale lock while another process may still be running.
