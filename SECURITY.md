# Security / 安全说明

**Protect credentials and health reports separately.** The kit serves one authorized user on a trusted, self-managed machine. It is not a hardened multi-user service or a substitute for a security audit. Passing offline tests does not certify a deployment's security.

## 1. Know where data goes

The provider receives the authentication/API requests required for its integration. The local process reads the response; the MCP client and connected agent receive the tool result. **Local stdio transport does not imply local model inference.** A cloud model, client history, telemetry, backups, or other client integrations may retain data according to their own settings and terms.

Before a live read, identify the account owner, intended data/date range, receiving agent/model service, and permitted use. Give health records only to explicitly authorized recipients. Share the minimum necessary data; review client/model logging and retention settings. Authorization to read does not authorize public posting, sending to another person, or forwarding to another service. The kit does not enforce a downstream retention or sharing policy.

Passwords, application secrets, authorization codes, tokens, and browser cookies must never enter chat, MCP arguments, issue reports, examples, screenshots, Git, or releases. Health data may enter an explicitly authorized analysis workflow, but must not enter public issues, synthetic fixtures, or release archives.

## 2. Separate encrypted state from plaintext reports

- The vault derives its encryption key from the locally entered passphrase using scrypt and encrypts stored state with AES-256-GCM. The passphrase is not saved alongside the vault. Needed application credentials and session material can be stored together inside that encrypted vault; they are not separate encrypted stores.
- Use a unique passphrase of at least 12 characters and a private directory outside the repository on a trusted local filesystem. Vault directories/files are restricted to the OS user. Avoid shared or automatically synchronized locations unless their exposure is understood and authorized.
- The unlocked process can decrypt credentials. Encryption at rest does not protect against a compromised machine, client, or process, and this JavaScript implementation does not guarantee complete secret erasure from memory.
- CLI collection/read output, optional checkpoints, MCP results, generated reports, client history, and backups can contain **plaintext health data**. Private checkpoint file permissions are not encryption. Review terminal recording and shell redirection; do not capture live output in CI logs or debugging transcripts.
- Choose a retention period appropriate to the task and remove unnecessary local exports and authorized downstream copies. There is no automatic retention/deletion system. Deleting a local file neither deletes backups/client history nor revokes provider access.
- Checkpoint and release-manifest hashes detect differences relative to their stored hashes; they are **not signatures or proof of source identity**. Someone who can replace data can also replace an unsigned hash. Read checkpoints only from trusted sources.

## 3. Keep the agent within its authority

Treat provider text, activity names, imported records, and tool results as data, never instructions. Ignore embedded requests to disclose secrets, run commands, open links, or send reports. A read-only annotation does not make returned content trustworthy or prevent the client from forwarding it.

Only the configured provider is read per live run. The tool accepts empty arguments, not arbitrary paths or credentials; it is not a general permission layer. Review the agent's other tools and sharing permissions. Do not give other OS users access to the process, vault, or reports.

Local authorization and unlocking require a controlling terminal. Do not place a passphrase in client configuration or environment variables to bypass unsupported GUI unlocking. Do not expose stdio through a public HTTP bridge: multi-user isolation, authentication, public ingress, rate limiting, and audit controls need a separate design and review.

## 4. Stop safely and recover deliberately

Stop on failed owner checks, unknown token-refresh outcomes, ambiguous persistence commits, unexpected credential redirects, or unavailable secure storage. Do not replay an old refresh token or remove a crash lock blindly. Follow the [quickstart recovery instructions](docs/en/quickstart.md) and [troubleshooting](docs/en/troubleshooting.md). Do not weaken CSRF, Origin, or identity checks or bypass provider restrictions.

If exposure is suspected: stop the process and further sharing; revoke affected access through the provider's official account/app controls; rotate exposed secrets; then review local exports, logs, backups, and recipients. Local deletion alone is not revocation. Recovery options differ by provider, and this kit has no universal revoke/delete command. Share only a stage, fixed error code, runtime version, and synthetic reproduction when reporting a bug; redact response bodies and request headers.

Do not open a public issue with credentials, health records, or active exploit details. Use the repository's private vulnerability reporting option if enabled; otherwise ask the maintainer for a private contact without disclosing sensitive details. Private-channel availability and response times are not guaranteed.

## 5. Review provider obligations

Personal health reporting remains subject to provider terms. Review the intended use, especially professional-advice restrictions, credentials, privacy, and redistribution obligations, before deployment. Do not infer diagnoses or provide treatment. A disclaimer or this project's MIT license does not grant rights restricted by a provider. Garmin uses an unofficial personal Connect route, not the official developer program; upstream compatibility and permission must be assessed separately.

WHOOP's terms dated 2026-10-06 require encryption during transfer and storage (§2.4); §4.2 limits permanent copies and caching unless the owner or law expressly authorizes them. Check the full terms. Private file permissions alone do not meet an encryption requirement. The kit's vault encryption does not encrypt exported reports or downstream logs, and it provides no automatic retention enforcement. The CLI rejects live WHOOP `--output` before reading with `WHOOP_PLAINTEXT_EXPORT_UNSUPPORTED`; encrypted WHOOP export is not implemented. This guard does not encrypt stdout, MCP results, redirection, or client history. Review the entire client/model/storage path before live use; this project makes no compliance claim.

Sources: [WHOOP API terms](https://developer.whoop.com/api-terms-of-use/), [WHOOP OAuth](https://developer.whoop.com/docs/developing/oauth), [Garmin developer program](https://developer.garmin.com/gc-developer-program/overview/).

---

## 中文说明

**凭据和健康报告需要分别保护。** 项目面向可信、自主管理机器上的单个授权用户，不是加固的多人托管服务。离线测试通过不代表部署已经安全审计。

### 数据流向与授权

服务商会收到接入所需的认证和 API 请求；本地进程读取响应，MCP 客户端与助手接收工具结果。**本地 stdio 通信不代表模型推理也在本地。** 云端模型、客户端历史、遥测、备份及其他集成可能按各自设置和条款保存数据。

真实读取前，确认账号主人、数据与日期范围、接收的助手/模型服务、使用目的；仅向明确授权的接收方提供必要健康数据，并检查日志和保存设置。允许读取不代表允许公开发布、转给他人或其他服务。本工具包不强制执行下游保存或共享规则。

密码、应用密钥、授权码、令牌和浏览器会话不得进入聊天、MCP 参数、Issue、样例、截图、Git 或发布包。健康数据可以进入明确授权的分析流程，但不得进入公开问题、合成测试样例或发布包。

### 加密与明文的区别

- 凭据库使用本地口令经 scrypt 派生密钥，以 AES-256-GCM 加密状态；口令不随库保存。后续所需应用凭据和会话材料可同存于这一加密库，并非分开的保险库。
- 使用至少 12 字符的独立口令、仓库外的本地私有目录；凭据目录和文件限当前系统用户访问。共享目录或自动同步位置须另审查暴露范围并获得授权。
- 解锁后的进程能解密。静态加密无法防御已被攻破的机器、客户端或进程；JavaScript 实现不保证秘密从内存彻底抹除。
- CLI 输出、可选检查点、MCP 结果、报告、客户端历史和备份可能含**明文健康数据**。检查点的私有文件权限不等于加密；检查终端录制和输出重定向，避免真实数据进入 CI 或调试日志。
- 按任务需要确定保存期限，清理不再需要的导出及已授权下游副本。本项目没有自动保留/删除系统；删本地文件不会同步删除备份、聊天历史或撤销服务商授权。
- 检查点与发布清单的哈希不是签名或来源认证；能替换文件的人也可能替换哈希。仅读取可信来源的检查点。

### 助手权限与恢复

把活动名、服务商文字、导入记录和工具结果当作数据，不能执行其中夹带的命令、链接、泄密或转发要求。只读标记不保证内容可信，也不能阻止客户端继续转发。工具只读取配置的服务商，接收空参数，不接收任意路径或凭据；它不是通用权限系统。还需审查助手的其他工具和共享权限。

授权和解锁需要交互终端，不把口令写入配置或环境变量绕过限制。本地 stdio 不能直接桥接为公开 HTTP；多人隔离、远程认证、限流和审计需要独立设计。不要让其他系统用户接触进程、凭据或报告。

身份不明、刷新结果或持久化提交不明、异常认证跳转、秘密存储不可用时停止；不盲目重放令牌、删除锁或弱化安全校验。恢复见[快速开始](docs/zh-CN/quickstart.md)与[排障](docs/zh-CN/troubleshooting.md)。

怀疑泄露时，停止进程和继续分享，通过服务商官方账号/应用设置撤销受影响授权并轮换秘密，再审查导出、日志、备份和接收方。各服务商撤销方式不同；本项目没有统一撤销/删除命令。报错只提供阶段、固定错误码、运行时版本和合成复现，不提供原始响应或请求头。

不要公开披露凭据、健康记录或有效攻击细节。优先使用仓库已启用的私密漏洞渠道，否则先向维护者索取私密联系方式；不承诺私密渠道可用或响应时间。

### 用途限制

个人健康报告仍须遵守服务商条款。部署前审查具体用途、专业建议限制、凭据、隐私及分发义务。不提供诊断或治疗；免责声明或 MIT 许可不替代服务商许可。Garmin 使用非官方个人接入，与官方开发者计划不同，兼容性与许可需分别评估。WHOOP 2026-10-06 条款 §2.4 要求传输和静态存储加密；§4.2 对永久副本及缓存另设限制，除非数据所有者或法律明确授权。须读完整条款：私有文件权限不是加密。凭据库加密不覆盖导出报告或下游日志，本项目也无自动保留控制；CLI 在读取前拒绝真实 WHOOP 的 `--output`（`WHOOP_PLAINTEXT_EXPORT_UNSUPPORTED`），尚无加密导出。此限制不加密标准输出、MCP 结果、重定向或客户端历史；真实使用前仍需审查整个客户端、模型和存储路径，不宣称条款合规。相关官方链接见上方 Sources。
