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

Review [security](../../SECURITY.md) and applicable provider terms first. The consent flag below acknowledges that review; it does not grant you additional provider permissions. Choose a **private directory outside the repository**. Vault directories/files use owner-only permissions. Use a unique passphrase of at least 12 characters.

Garmin **international/global accounts only**:

```sh
npm run auth -- --provider garmin --state-dir "$HOME/.wearable-agent-kit/garmin" --accept-provider-terms
```

Enter the vault passphrase, account email, password and any MFA code locally when prompted. Secret inputs use the controlling terminal and are hidden. The password is not saved; authorized session state is encrypted. China-region accounts are not implemented: do not assume switching your location will make this route suitable.

WHOOP:

1. Use your own WHOOP OAuth application and register exactly `http://127.0.0.1:8787/oauth/callback` as its redirect URI.
2. Run:

```sh
npm run auth -- --provider whoop --state-dir "$HOME/.wearable-agent-kit/whoop" --accept-provider-terms
```

3. Enter your application ID and secret locally. Follow the printed authorization link in your browser and complete WHOOP's consent. The loopback callback must reach this same machine.

Do not paste secrets into commands, chat, configuration examples or MCP arguments. Vault passphrases are not saved; a new process requires unlocking again. Provider credentials/session material needed for subsequent operations are held in the encrypted local vault. The unlocked process can decrypt them.

## 3. Minimal real read

```sh
npm run collect -- --live --provider garmin --state-dir "$HOME/.wearable-agent-kit/garmin"
npm run collect -- --live --provider whoop --state-dir "$HOME/.wearable-agent-kit/whoop"
```

Inspect `mode`, `provider`, `readAt`, actual record times, and coverage. Garmin defaults to yesterday under `Asia/Manila`; use `--timezone` with an explicit IANA zone if appropriate, and `--day YYYY-MM-DD` for an allowed date. Travel does not change it automatically. The provider restricts reads to its authorized recent window.

To save a live checkpoint, add `--output` pointing to a private location. **Checkpoints contain the readable report, not an encrypted vault.** Keep them out of Git and protect backups. A successful login alone is not a successful read.

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

### Recover a deliberately blocked connection

After reviewing an interrupted operation, WHOOP can be explicitly reauthorized using the same `auth` command and unlocked vault. Garmin currently refuses to overwrite an existing connection: use a new private `--state-dir` for a fresh, user-approved authentication. Review and archive the old vault yourself; do not automatically delete it or copy its tokens. Neither route authorizes breaking a stale lock while another process may still be running.
