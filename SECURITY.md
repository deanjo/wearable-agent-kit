# Security

This project targets one trusted user on a self-managed machine. Read-only tools can still disclose sensitive health data. Treat the agent, MCP client, operating-system account, storage, and backups as part of the trust boundary.

## Keep secrets outside the project

- Never put passwords, developer secrets, authorization codes, tokens, browser cookies, or real health records in prompts, issues, fixtures, screenshots, commits, or releases.
- Use the documented local authorization flow. Do not extract browser sessions or send credentials as MCP tool arguments.
- Keep application credentials and token encryption keys separate from token storage. Encryption at rest does not protect against a compromised process holding its key.
- Exclude local state from version control and protect its filesystem permissions. Review the actual release archive and Git history; `.gitignore` cannot remove a committed secret.
- Redact provider response bodies and request headers from diagnostics. A fixed error code is usually enough to investigate.

## Stop instead of guessing

Stop on failed owner checks, unknown token-refresh outcomes, ambiguous persistence commits, unexpected credential redirects, or unavailable secure storage. Do not replay an old refresh token after an unknown outcome. Reconcile storage first; use fresh authorization only when recovery genuinely requires it.

Do not weaken CSRF, Origin, or owner checks to make a login work. Local stdio does not make a public HTTP endpoint safe. Multi-user tenancy, remote authentication, public ingress, rate limiting, audit policy, and abuse prevention require a separate design and review.

## Reporting a problem

Do not open a public issue containing an exploit with active credentials or personal data. Use the repository's private vulnerability reporting option if enabled; otherwise ask the maintainer for a private contact without disclosing the sensitive details. Revoke exposed credentials at the provider, then rotate affected local secrets. Deleting a file alone does not revoke access.

## Provider obligations

WHOOP API terms effective **2026-10-06** prohibit embedding developer credentials in open-source projects and restrict uses including medical or other professional advice. This project is for data quality and non-diagnostic trend exploration. A disclaimer does not establish permission: review the terms and intended deployment before publishing or operating an integration. Use only authorized data and keep an appropriate privacy policy where required.

Sources: [WHOOP API terms](https://developer.whoop.com/api-terms-of-use/), [WHOOP OAuth](https://developer.whoop.com/docs/developing/oauth), [Garmin developer program](https://developer.garmin.com/gc-developer-program/overview/).

---

## 中文摘要

项目面向单用户、自主管理的机器。只读接口仍可泄露健康数据；操作系统账号、MCP 客户端、Agent、存储和备份都属于信任边界。

- 密码、应用密钥、令牌、浏览器会话和真实健康记录不得进入聊天、Issue、样例、Git 历史或发布包。
- 使用文档规定的本地授权流程，不从浏览器提取会话，不把凭据作为 MCP 参数。
- 密钥与令牌存储分离。静态加密不等于持有密钥的进程无法读取；`.gitignore` 不会清除已提交的秘密。
- 刷新结果或持久化提交结果不明时停止，不重放旧令牌；不要通过关闭 Origin、CSRF 或身份校验来修复登录。
- 本地 stdio 方案不能直接改成公开 HTTP 服务；多人隔离和远程授权需要独立设计。
- 安全问题通过仓库已启用的私密漏洞渠道报告；未启用时先索取私密联系方式，勿公开敏感详情。
- WHOOP 2026-10-06 条款禁止在开源项目中嵌入开发凭据，并限制医疗等专业建议用途。部署与发布前应审查具体用途；免责声明不能替代许可。
