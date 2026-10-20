# Agent integration contract

## Goal

Produce a reproducible, provenance-aware read before producing a report. Operate for one explicitly authorized user. Default to synthetic mode; never disguise fixtures as real data.

## First run

1. Read `README.md`, `SECURITY.md`, and `docs/validation.md`.
2. Run `npm run doctor`, then `npm run verify` with Node.js 24 or later.
3. Confirm the synthetic checkpoint can be read by a new process.
4. For live work, use the human-facing local authorization flow in `docs/en/quickstart.md`. Never ask for passwords, OAuth codes, vault passphrases, or tokens in a conversation or MCP call.
5. Require a successful real read with actual record times before claiming connection success. A connection badge, token, test, or empty HTTP 200 is insufficient.

## Reporting rules

- Preserve source, mode, date boundary, retrieval time, actual measurement times, and coverage limitations.
- Inspect HTTP failures, fixed connector error codes, pagination status/reason, and coverage; a protocol-level success flag is not enough.
- Separate naps/main sleep and unmatched recovery. Do not label recovery as a specific night until matched.
- Report heart-rate point count and observed range. Do not interpolate missing data silently or call samples a raw waveform.
- Do not sum possible cross-provider duplicates or infer no activity from an empty result.
- Describe same-source non-diagnostic trends only. Review applicable provider terms; disclaimers do not grant permission for restricted uses.

## Stop conditions

Stop on unknown refresh or commit outcome, absent secure storage, invalid owner boundary, unexpected credential redirects, or missing user authority. Report the stage and a secret-free error code. Never bypass CAPTCHA, rate limits, CSRF, Origin checks, or provider restrictions. Network failures are not evidence of a wrong password and do not automatically call for reauthorization.

## Change discipline

Keep provider logic, transport, persistence, analysis, and agent exposure separate. Add offline tests for failure paths, not only happy paths. Re-run `npm run verify` after relevant edits. Update both language READMEs and affected guides when commands or claims change. Record synthetic and live evidence separately; never borrow test counts or live acceptance from another deployment.

Before publication, inspect tracked files, history, and archive contents for secrets, personal data, private hosts, and real health fixtures. A passing test suite is not a security audit. Do not publish or deploy unless the user authorized that destination and scope.
