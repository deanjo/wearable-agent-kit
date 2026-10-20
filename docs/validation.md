# Validation / 验收

**Evidence belongs to a specific package revision and execution.** Historical results from a different deployment do not certify this package. Keep synthetic, simulated-provider, and real-account evidence separate.

**证据必须对应具体代码版本和执行。** 其他部署的历史结果不能证明本项目已验收；合成数据、模拟上游和真实账号证据分别记录。

## Reproduce offline / 复现离线验收

```sh
npm run doctor
npm run verify
```

`verify` runs offline tests, performs a synthetic collection, and reads the generated checkpoint in a new process. It needs no account or provider authorization. Record actual UTC execution time, runtime version, source revision/archive hash, command, exit code, test count, checkpoint path/hash, and new-process read result. Avoid capturing secrets or real health output.

`verify` 执行离线测试、合成采集，并用新进程读取该次检查点。无需账号或服务商授权。记录实际 UTC 执行时间、运行时版本、源码版本/包哈希、命令、退出码、测试数、检查点路径/哈希及新进程读回结果，不记录秘密或真实健康输出。

## Acceptance levels / 验收层级

| Level / 层级 | Demonstrates / 能证明 | Does not demonstrate / 不能证明 |
|---|---|---|
| Synthetic CLI + checkpoint / 合成 CLI 与检查点 | Local path and new-process recovery / 本地流程与新进程恢复 | Real authorization or health access / 真实授权或健康数据访问 |
| Fake provider transport / 模拟服务商传输 | Tested response/error/refresh paths / 已覆盖的响应、错误和刷新路径 | Current vendor protocol compatibility / 当前厂商协议兼容 |
| Real authorized read / 真实授权读取 | That source returned records at the stated time / 当时该来源确实返回记录 | All devices synced or all history available / 所有设备同步或历史全量 |
| Real restart + refresh / 真实重启与刷新 | Tested persisted session recovery and rotation / 已验会话恢复与令牌轮换 | Indefinite availability / 长期永不掉线 |
| Scheduler + delivery / 调度与送达 | The tested trigger, run and send outcome / 所测触发、执行和发送结果 | Future punctuality or recipient read / 未来准点或用户已读 |

The fresh package has **no real-account acceptance claim**. Before using it with live data, complete the local authorization and minimal read, then test persistence and refresh under the intended environment. No real credentials are required or used for this repository's offline release check.

新项目**不宣称已经完成真实账号验收**。真实使用前，需在目标环境完成本地授权、最小读取、持久化恢复与刷新测试。本仓库离线发布检查无需且不使用真实凭据。

## Live evidence checklist / 真实验收清单

- Explicit user authority and applicable provider terms reviewed. / 明确用户授权，审查服务商条款。
- Correct account/region; successful read with actual measurement times. / 正确账号与区域，成功读取且有实际测量时间。
- Heart-rate valid points/time range and activity pagination/coverage checked. / 核对有效心率点及时间范围、活动分页与覆盖。
- Persisted state read from a new process; refresh success and ambiguous-failure behavior tested. / 新进程读回状态；测试刷新成功与结果不明的处理。
- Errors and artifacts contain no secrets or unnecessary personal data. / 错误与产物不含秘密或不必要的个人数据。
- Remote hosting and scheduling, if added, receive separate acceptance. / 若增加远程托管或调度，分别验收。

## Observed offline check / 已执行的离线检查

On **2026-10-20 at 08:01:03 UTC**, Node.js **24.19.0**, `npm run doctor` and `npm run verify` exited successfully: **105 tests passed, 0 failed**, network denied during verification, synthetic collection succeeded, and a new process read the checkpoint. Live-provider acceptance was **false**. This records a development snapshot, not a claim about later revisions; rerun after any code change.

**2026-10-20 08:01:03 UTC**，Node.js **24.19.0** 下，`npm run doctor` 与 `npm run verify` 成功退出：**105 项通过、0 项失败**；验收期间禁用网络，合成采集成功，新进程读回检查点成功。真实服务商验收为 **false**。这是开发快照的记录，不证明后续版本；代码变更后应重跑。

## Security and diagram update / 安全与图示更新

On **2026-10-20 at 09:53:30 UTC**, the integrated update ran under Node.js **24.19.0**: **128 tests passed, 0 failed**, 75 inventory entries verified, network denied, synthetic collection and a fresh-process checkpoint read succeeded. Live-provider acceptance remains **false**. The update adds day-option validation, bounded regular-file checkpoint reads, credential-directory output protection, and rejection of live WHOOP plaintext checkpoint exports. These checks are not a complete security audit or proof of downstream encryption.

**2026-10-20 09:53:30 UTC**，集成更新在 Node.js **24.19.0** 下通过 **128 项测试，0 失败**，核对 75 项清单；禁网合成采集及新进程检查点读回成功，真实服务商验收仍为 **false**。新增日期参数校验、检查点普通文件有界读取、凭据目录输出保护，以及真实 WHOOP 明文检查点导出拒绝。这不等于完整安全审计或下游加密证明。

Dark bilingual diagrams passed static and JavaScript syntax checks and visual inspection of their PNG previews. Final real-browser interaction acceptance is still pending; see [diagram validation](architecture/README.md). No account or real health data was accessed for this update.

双语暗色图通过静态检查、JavaScript 语法检查和 PNG 预览目视检查；最终真实浏览器交互验收仍待完成，见[图示验收说明](architecture/README.md)。本次更新未访问账号或真实健康数据。

## Source inventory / 源码清单

`verify` also compares file names and SHA-256 hashes against `RELEASE_MANIFEST.json` (excluding `.git` and the manifest itself). This detects changes relative to the supplied inventory; it does not authenticate the publisher. Keep generated checkpoints and private state outside the repository. After an intentional reviewed source/document edit, run `node scripts/update-manifest.mjs`, review the resulting diff, then rerun verification.

`verify` 也会核对 `RELEASE_MANIFEST.json` 中的文件清单及 SHA-256（不含 `.git` 和清单本身）。这用于发现相对清单的改动，不证明发布者身份。检查点和私有状态应放在仓库外。经审查主动修改代码或文档后，运行 `node scripts/update-manifest.mjs`，审查差异后重新验收。

A synthetic controlling-terminal smoke test also passed on 2026-10-20: hidden input was not echoed and the process exited 0. This does not test a real account, browser OAuth callback, GUI launcher, or all operating systems.

2026-10-20 已额外通过合成终端输入检查：秘密输入不回显、进程退出码 0；不代表真实账号、浏览器 OAuth 回调、GUI 启动器或所有操作系统已验。
