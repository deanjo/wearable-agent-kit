# Architecture diagrams / 架构图

## Purpose and data journey / 用户价值与数据流

- English overview: [PNG](overview-en.png), [SVG](overview-en.svg), [interactive HTML](overview-en.html), [JSON](overview-en.json)
- 中文概览：[PNG](overview-zh-CN.png)、[SVG](overview-zh-CN.svg)、[交互 HTML](overview-zh-CN.html)、[JSON](overview-zh-CN.json)

The overview connects devices → vendor platforms → authorized local read → traceable data → the external agent → personal health report. Device synchronization and agent interpretation are external responsibilities, not new toolkit services. Its source references are pinned to [e2c8c44](https://github.com/deanjo/wearable-agent-kit/tree/e2c8c44888e69b2a087adeda4f3f987517438d50).

概览串起设备、厂商平台、本地授权读取、可追溯数据、外部 Agent 与个人报告。设备同步和 Agent 深层分析属于外部职责，不表示工具包新增服务。

## Technical architecture / 技术架构

- English: [PNG](architecture-en.png), [SVG](architecture-en.svg), [interactive HTML](architecture-en.html), [editable JSON](architecture-en.json)
- 简体中文：[PNG](architecture-zh-CN.png)、[SVG](architecture-zh-CN.svg)、[交互 HTML](architecture-zh-CN.html)、[可编辑 JSON](architecture-zh-CN.json)

## Read the diagram / 怎样读图

Source links deliberately remain pinned to the reviewed published revision below, rather than unstable lines in a future release; later hardening may change line numbers without changing this component overview. These diagrams describe the local CLI wiring at [source revision f56a5b4](https://github.com/deanjo/wearable-agent-kit/tree/f56a5b4458155d676777f006a04e9ee6da8d7ecf). Arrows summarize invocation, data wrapping and persistence responsibilities; they are not a chronological sequence or a deployment topology. API responses and caller return paths are omitted for clarity. Components in the HTML contain commit-pinned source references.

The default synthetic path uses no network or vault. Live mode selects **one** provider per process: WHOOP's official API/OAuth or Garmin's unofficial personal Connect route. The local stdio MCP is project code, not a vendor-provided integration. A summary returns to the CLI or calling agent. `read --checkpoint` is a separate offline path; MCP does not normally read the checkpoint.

Authorization is an explicit human-facing `auth` command using the local TTY. WHOOP uses browser consent and a validated loopback callback. Garmin uses its unofficial login route with MFA when required. Secrets never belong in MCP tool arguments. WHOOP application credentials and tokens, or Garmin session tokens, go into the encrypted vault. Garmin password/MFA and the vault passphrase are not saved. Unlocked processes can decrypt the vault; read-only health access may refresh tokens and update it. Where export is permitted, a checkpoint is **plaintext JSON with a SHA-256 integrity check**, not encrypted credential storage. Current release policy permits this for synthetic/Garmin only; live WHOOP `--output` is rejected by the current [CLI guard](../../src/cli.mjs). The technical diagram retains its pre-hardening source pin and shows this newer restriction separately in the reader hint and static caption. Authorization alone does not establish live-data acceptance.

图示对应上述固定源码版本的本地 CLI 装配。箭头概括调用、数据封装与存储责任，不是完整时序或部署拓扑；为清晰起见省略 API 返回及调用方返回线。交互 HTML 内的组件带有固定提交的源码引用。

默认合成路径不联网、不解锁凭据库。live 进程每次只选 WHOOP 或 Garmin：前者使用官方 OAuth/API，后者为非官方个人 Connect 路径。本项目 MCP 不是厂商提供的接口；摘要返回 CLI 或调用 Agent。`read --checkpoint` 是独立离线读回路径，MCP 默认不读检查点。

授权通过显式 `auth` 命令及本地 TTY 完成。WHOOP 在官方网页同意授权并经回环回调；Garmin 使用非官方登录，必要时输入 MFA。秘密不进入 MCP 参数。WHOOP 应用凭据与令牌、或 Garmin 会话令牌存入加密 vault；Garmin 密码/MFA、vault 口令不保存。解锁进程可解密；只读健康数据也可能刷新令牌并更新 vault。允许导出时，检查点是**明文 JSON + SHA-256 完整性校验**，不是加密凭据库。当前版本仅允许合成/Garmin 路径这样导出；WHOOP live 的 `--output` 被拒绝。技术图保留加固前的源码引用，将此新版限制另列于交互提示和静态图注。授权成功不等于真实数据验收。

## Interactive reader / 交互阅读

The HTML starts in a dark signal-flow theme. Animation uses one **Live / Still** control, with a remembered explicit pause. The reader includes reduced-motion handling; its browser behavior still requires verification. Click a node to highlight its authored neighbors and inspect source references. Theme switching remains available, while the visual-style chooser is hidden to keep the toolbar simpler. Motion is illustrative; it does not indicate actual requests or synchronization.

**GitHub PNG/SVG previews are static and cannot play the HTML animation.** Download the HTML for the interactive reader. When opened from `file://` or localhost, copy-view-link buttons are disabled to avoid sharing a private filesystem path or a link that others cannot open; share the HTML file instead. Source-reference links remain available. The viewer adds no health API calls and does not send diagram content to an online rendering service.

HTML 默认深色流光主题，仅保留一个 **动态 / 静止** 动画开关，并记住主动暂停；代码包含系统减少动态偏好处理，其浏览器行为仍待验证。点击节点联动高亮已有相邻关系并查看源码。保留明暗切换，隐藏多余视觉风格选择。动画只表示图中关系，不表示真实请求或同步状态。

**GitHub 的 PNG/SVG 预览是静态图，不会播放 HTML 动画。** 下载 HTML 可使用交互阅读器。从 `file://` 或 localhost 打开时，复制视图链接按钮禁用，避免分享个人本地路径或无效地址；应分享 HTML 文件，源码链接不受影响。页面不会调用健康 API，也不向在线绘图服务传输内容。

## Open and verify / 打开与验收

Download the HTML file and open it in your local browser. GitHub's blob/file page displays source and does **not** run the viewer. There is no GitHub Pages deployment for these files. The viewer is self-contained; following source links needs internet access.

Archify's schema, source-reference, layout and HTML/SVG static checks passed for the original technical HTML artifacts and the new overview artifacts. The static SVGs were extracted without executing viewer JavaScript, frozen to the dark signal-flow palette, rasterized with installed Inkscape, and visually inspected in both languages. They are not claimed to be outputs of the viewer's Export menu. **The automated real-browser gate could not run in the authoring environment. A separate Chrome check of an earlier two-file technical-diagram build verified dark themes, Live/Still, pause persistence after refresh, and neighboring-node highlighting in both languages; English reachability tracing, zoom and drag also passed. It found that the promised scenario controls were absent. This revision removes that promise and the unused source configuration instead of adding new controls. The final four-file build and reduced-motion behavior still await browser verification.** No real account or health data was accessed for these diagrams. Local diagnostic logs and provenance sidecars are intentionally not published.

下载 HTML 后用本地浏览器打开。GitHub 文件页不会执行交互内容，也没有为本图部署 GitHub Pages。HTML 自包含；点击源码链接需联网。

双语 HTML 的 schema、源码引用、布局与 HTML/SVG 静态检查通过。静态 SVG 从生成页面提取，固定深色流光样式，以已有 Inkscape 栅格化，并完成双语视觉检查；不声称使用过页面的 Export 菜单。**制作环境未能完成真实浏览器自动验收。另一次 Chrome 检查针对较早的双语技术图，已验证暗色、动态/静止、刷新后保留暂停与相邻节点高亮；英文上下游追踪、缩放、拖动也通过。检查发现文案承诺的场景控件不存在，本轮删除该承诺及未使用的源配置，不新增控件。最终四文件版本和减少动态行为仍待浏览器验收。** 制作未访问真实账号或健康数据；不发布本地诊断日志和环境路径。

Browser evidence applies only to predecessor HTML SHA-256 `1a2da2e76441f3c16000a87cddc5bc28f3c99ed162fe3575831c03a6b992c747` (EN) and `ea8c29dd1da0778fb0606669eb9bafa23c916da7b92a95d8cbdd2cf700817a00` (中文). It does not establish acceptance of later changes or the overview diagrams.

上述浏览器证据仅适用于列出的旧版本哈希，不证明后续改动或概览图已通过。

## Rebuild / 重建

Use [Archify commit 25cf370](https://github.com/tt-a1i/archify/tree/25cf37080fc8b1dbe758a4efc3935b55f3327083). Review third-party code before running it. No package installation is needed with a supported Node.js runtime and local Chromium/Chrome. From the repository root, substitute the reviewed skill path:

```sh
for name in architecture-en architecture-zh-CN overview-en overview-zh-CN; do
  ARCHIFY_UPDATE_CHECK_DISABLED=1 node /path/to/archify/bin/archify.mjs finalize architecture "docs/architecture/$name.json" "docs/architecture/$name.html" --repo-root . --quality showcase --json
done
python3 docs/architecture/customize-viewer.py
python3 docs/architecture/extract-static.py
python3 docs/architecture/check-reader-contract.py
for name in architecture-en architecture-zh-CN overview-en overview-zh-CN; do
  inkscape "docs/architecture/$name.svg" --export-type=png --export-width=2360 --export-filename="docs/architecture/$name.png"
done
```

The reviewed `customize-viewer.py` applies the project-specific dark default, single motion choice and reader hint after Archify rendering; it does not change nodes, edges or source references. Post-customization HTML needs a fresh static check (without claiming the earlier delivery sidecar still authenticates its bytes) and browser inspection. Keep generated receipts outside the release inventory.

A nonzero finalizer result is not full acceptance. Inspect the failed gate. After reviewing intended file changes and excluding local diagnostics, regenerate the release inventory with `node scripts/update-manifest.mjs` and run `npm run verify`.

`finalize` 非零退出不代表完整通过，应检查具体失败阶段。审查改动、排除本地日志后，重生清单并执行离线验收。

Licenses: [Archify MIT](ARCHIFY-LICENSE.txt), [JetBrains Mono OFL](JetBrainsMono-OFL.txt), [project third-party notices](../../THIRD_PARTY_NOTICES.md).
