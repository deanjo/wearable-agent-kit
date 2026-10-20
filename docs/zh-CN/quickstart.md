# 快速开始

**先验证离线路径，再显式接入真实账号。** 使用可信的 Linux/macOS 机器及 Node.js 24+，在仓库根目录运行命令，无需安装第三方运行时依赖。

## 1. 离线验收

```sh
npm run doctor
npm run verify
npm run collect -- --output /tmp/wak-checkpoint.json
npm run read -- --checkpoint /tmp/wak-checkpoint.json
```

应看到合成模式及新进程检查点恢复成功。这些命令不登录、不读取真实健康数据。`verify` 使用临时文件并在结束时清理，输出实际执行时间和测试计数。

## 2. 本地授权

先读[安全说明](../../SECURITY.md)及相应服务商条款。下面的确认参数表示你已审查条款，不会额外授予服务商权限。选择**仓库外的私有目录**；保险库目录和文件只允许当前用户访问。使用至少 12 字符的独立口令。

Garmin **仅支持国际区账号**：

```sh
npm run auth -- --provider garmin --state-dir "$HOME/.wearable-agent-kit/garmin" --accept-provider-terms
```

按提示在本地输入保险库口令、账号邮箱、密码和所需验证码。秘密通过控制终端隐藏输入。密码不保存；授权会话状态加密保存。尚未实现中国区账号，不要认为更换所在地就能使用该路径。

WHOOP：

1. 使用自己的 WHOOP OAuth 应用，精确注册回调地址 `http://127.0.0.1:8787/oauth/callback`。
2. 运行：

```sh
npm run auth -- --provider whoop --state-dir "$HOME/.wearable-agent-kit/whoop" --accept-provider-terms
```

3. 在本地输入应用 ID 和密钥，使用浏览器打开输出的授权链接，完成 WHOOP 同意授权。回环回调必须能返回运行此命令的同一台机器。

秘密不要放进命令、聊天、配置示例或 MCP 参数。保险库口令不保存，新进程需重新解锁；后续操作所需的应用凭据及会话材料保存在本地加密保险库中。解锁的运行进程可以解密它们。

## 3. 最小真实读取

```sh
npm run collect -- --live --provider garmin --state-dir "$HOME/.wearable-agent-kit/garmin"
npm run collect -- --live --provider whoop --state-dir "$HOME/.wearable-agent-kit/whoop"
```

检查 `mode`、`provider`、`readAt`、实际记录时间及覆盖信息。Garmin 默认读取 `Asia/Manila` 日界的昨日；必要时用 `--timezone` 显式指定 IANA 时区，用 `--day YYYY-MM-DD` 指定允许日期。旅行不会自动更改日界；读取仍限于 Provider 授权的近期窗口。

如需保存真实检查点，用 `--output` 指向私有位置。**检查点是可读报告，不是加密保险库。** 不要提交到 Git，备份也需保护。登录成功本身不等于取数成功。

## 4. 接入 MCP 客户端

`deploy/reference/mcp.example.json` 默认通过本地 stdio 启动合成模式，将其中绝对路径替换成你的实际路径。只读工具为 `read_wearable_summary`，参数为 `{}`；额外参数（包括凭据）会被拒绝。

```sh
npm run mcp
```

真实模式使用同样的显式 Provider 与状态目录：

```sh
npm run mcp -- --live --provider garmin --state-dir "$HOME/.wearable-agent-kit/garmin"
```

真实模式启动需要控制终端解锁保险库。GUI 客户端若启动服务器时没有终端，**首版不支持其真实模式解锁**。不要通过把口令写入客户端配置来绕过此限制。单独启动服务器不等于客户端已连接；客户端需要持有该 stdio 会话。

刷新或锁阻塞见[排障指南](troubleshooting.md)。刷新中断后不要盲目删除锁或重放旧令牌。真实接入或定时运行的成功标准见[验收说明](../validation.md)。

### 恢复主动阻塞的连接

审查中断操作后，WHOOP 可使用相同 `auth` 命令解锁保险库并显式重新授权。Garmin 当前拒绝覆盖已有连接：使用新的私有 `--state-dir`，重新完成用户批准的认证。旧保险库由用户审查、归档，不自动删除或复制令牌。若可能还有进程运行，两条路径都不代表可以强行移除旧锁。
