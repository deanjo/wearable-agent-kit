# Architecture diagrams / 架构图

- English: [PNG](architecture-en.png), [SVG](architecture-en.svg), [interactive HTML](architecture-en.html), [editable JSON](architecture-en.json)
- 简体中文：[PNG](architecture-zh-CN.png)、[SVG](architecture-zh-CN.svg)、[交互 HTML](architecture-zh-CN.html)、[可编辑 JSON](architecture-zh-CN.json)

## Read the diagram / 怎样读图

These diagrams describe the local CLI wiring at [source revision f56a5b4](https://github.com/deanjo/wearable-agent-kit/tree/f56a5b4458155d676777f006a04e9ee6da8d7ecf). Arrows summarize invocation, data wrapping and persistence responsibilities; they are not a chronological sequence or a deployment topology. API responses and caller return paths are omitted for clarity. Components in the HTML contain commit-pinned source references.

The default synthetic path uses no network or vault. Live mode selects **one** provider per process: WHOOP's official API/OAuth or Garmin's unofficial personal Connect route. The local stdio MCP is project code, not a vendor-provided integration. A summary returns to the CLI or calling agent. `read --checkpoint` is a separate offline path; MCP does not normally read the checkpoint.

Authorization is an explicit human-facing `auth` command using the local TTY. WHOOP uses browser consent and a validated loopback callback. Garmin uses its unofficial login route with MFA when required. Secrets never belong in MCP tool arguments. WHOOP application credentials and tokens, or Garmin session tokens, go into the encrypted vault. Garmin password/MFA and the vault passphrase are not saved. Unlocked processes can decrypt the vault; read-only health access may refresh tokens and update it. A checkpoint is **plaintext JSON with a SHA-256 integrity check**, not encrypted credential storage. Authorization alone does not establish live-data acceptance.

图示对应上述固定源码版本的本地 CLI 装配。箭头概括调用、数据封装与存储责任，不是完整时序或部署拓扑；为清晰起见省略 API 返回及调用方返回线。交互 HTML 内的组件带有固定提交的源码引用。

默认合成路径不联网、不解锁凭据库。live 进程每次只选 WHOOP 或 Garmin：前者使用官方 OAuth/API，后者为非官方个人 Connect 路径。本项目 MCP 不是厂商提供的接口；摘要返回 CLI 或调用 Agent。`read --checkpoint` 是独立离线读回路径，MCP 默认不读检查点。

授权通过显式 `auth` 命令及本地 TTY 完成。WHOOP 在官方网页同意授权并经回环回调；Garmin 使用非官方登录，必要时输入 MFA。秘密不进入 MCP 参数。WHOOP 应用凭据与令牌、或 Garmin 会话令牌存入加密 vault；Garmin 密码/MFA、vault 口令不保存。解锁进程可解密；只读健康数据也可能刷新令牌并更新 vault。检查点是**明文 JSON + SHA-256 完整性校验**，不是加密凭据库。授权成功不等于真实数据验收。

## Open and verify / 打开与验收

Download the HTML file and open it in your local browser. GitHub's blob/file page displays source and does **not** run the viewer. There is no GitHub Pages deployment for these files. The viewer is self-contained; following source links needs internet access.

Archify's schema, source-reference, layout and HTML/SVG static checks passed for both HTML artifacts. The static SVGs were extracted without executing viewer JavaScript, frozen to a light palette, rasterized with installed Inkscape, and visually inspected in both languages. They are not claimed to be outputs of the viewer's Export menu. **The automated real-browser gate could not run in the authoring environment, so interactive browser acceptance remains unverified.** No real account or health data was accessed for these diagrams. Local diagnostic logs and provenance sidecars are intentionally not published.

下载 HTML 后用本地浏览器打开。GitHub 文件页不会执行交互内容，也没有为本图部署 GitHub Pages。HTML 自包含；点击源码链接需联网。

双语 HTML 的 schema、源码引用、布局与 HTML/SVG 静态检查通过。静态 SVG 从生成页面提取，固定浅色样式，以已有 Inkscape 栅格化，并完成双语视觉检查；不声称使用过页面的 Export 菜单。**制作环境未能完成真实浏览器自动验收，交互行为尚未验证。** 制作未访问真实账号或健康数据；不发布本地诊断日志和环境路径。

## Rebuild / 重建

Use [Archify commit 25cf370](https://github.com/tt-a1i/archify/tree/25cf37080fc8b1dbe758a4efc3935b55f3327083). Review third-party code before running it. No package installation is needed with a supported Node.js runtime and local Chromium/Chrome. From the repository root, substitute the reviewed skill path:

```sh
ARCHIFY_UPDATE_CHECK_DISABLED=1 node /path/to/archify/bin/archify.mjs finalize architecture docs/architecture/architecture-en.json docs/architecture/architecture-en.html --repo-root . --quality showcase --json
ARCHIFY_UPDATE_CHECK_DISABLED=1 node /path/to/archify/bin/archify.mjs finalize architecture docs/architecture/architecture-zh-CN.json docs/architecture/architecture-zh-CN.html --repo-root . --quality showcase --json
python3 docs/architecture/extract-static.py
inkscape docs/architecture/architecture-en.svg --export-type=png --export-width=2360 --export-filename=docs/architecture/architecture-en.png
inkscape docs/architecture/architecture-zh-CN.svg --export-type=png --export-width=2360 --export-filename=docs/architecture/architecture-zh-CN.png
```

A nonzero finalizer result is not full acceptance. Inspect the failed gate. After reviewing intended file changes and excluding local diagnostics, regenerate the release inventory with `node scripts/update-manifest.mjs` and run `npm run verify`.

`finalize` 非零退出不代表完整通过，应检查具体失败阶段。审查改动、排除本地日志后，重生清单并执行离线验收。

Licenses: [Archify MIT](ARCHIFY-LICENSE.txt), [JetBrains Mono OFL](JetBrainsMono-OFL.txt), [project third-party notices](../../THIRD_PARTY_NOTICES.md).
