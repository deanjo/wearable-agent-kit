# Wearable Agent Kit

[English](README.md)

**把分散在健康硬件中的身体数据交给个人 AI 助手，帮助你理解睡眠、恢复和训练变化，管理健康信息并获得有依据的报告。** 这是供开发者搭建个人健康助手的工具包，目前面向单用户、本地终端运行。

目标是让助手能：
- 汇集来源可追溯的身体数据，知道数据来自哪里、何时测量
- 结合你提供的个人信息和可用历史趋势，解释变化
- 输出包含结论、依据、习惯建议及缺失信息的个人健康报告

**当前工具包负责取数和描述性摘要，深入解读与习惯建议由接入的 Agent（智能助手）负责。** 例如，你问“昨晚睡得怎样，近期训练有没有变化？”，助手先取数，再根据实际记录回答；缺少历史数据时说明不足。

## 三步开始

需要可信的 Linux/macOS 机器、Git 和 Node.js **24+**，无需安装第三方运行时依赖。

**1. 下载项目。**

```sh
git clone https://github.com/deanjo/wearable-agent-kit.git
cd wearable-agent-kit
```

**2. 先跑通离线流程。** 无需账号，不读取真实健康数据。

```sh
npm run doctor
npm run verify
```

**3. 接入自己的账号和助手。** 按[快速开始](docs/zh-CN/quickstart.md)完成本地授权、真实读取和 MCP（供助手调用工具的协议）配置。密码、口令和令牌只在本机输入，不要发进聊天。

## 能得到怎样的报告

建议让助手按四点回答，详见[分析指南](docs/zh-CN/analysis-guide.md)：
- 结论：睡眠、恢复或训练有哪些可观察变化
- 依据：来源、测量日期、可比较的历史记录
- 建议：适合讨论或尝试的日常习惯，不做诊断或治疗
- 缺失：缺哪些数据，哪些判断暂时不能作出

## 数据怎样到达助手

设备 → 厂商平台 → 本项目 → Agent → 个人健康报告。

![本地运行架构](docs/architecture/architecture-zh-CN.png)

图中 Provider 是服务商接入代码；只读 MCP 工具由本项目实现。[交互图与图源](docs/architecture/README.md)中的 HTML 需下载后本地打开，GitHub 文件页不能直接运行。

## 当前进度与边界

已提供 WHOOP 官方 API（数据接口）、Garmin 非官方 Connect 接入（佳明仅国际区）、本地加密凭据库和只读工具。尚未内置长期健康档案、多设备自动融合或定时发报告系统，也不支持 dot 云端一键连接。

`doctor` 检查环境；`verify` 核对文件、运行 105 项离线测试，并用新进程读回合成摘要。成功不等于真实接入：输出 `liveProviderAcceptance: false`，本版本尚未完成真实账号验收，见[验收说明](docs/validation.md)。

真实模式每次选一家服务商，授权和解锁需要 TTY（交互终端），无终端的图形客户端暂不支持。凭据库加密，但导出的摘要是明文，应存于仓库外私有位置。部署前审查 [WHOOP API 条款](https://developer.whoop.com/api-terms-of-use/)中的用途限制及[安全边界](SECURITY.md)；免责声明不能替代许可。

## 深入了解

[能力范围](docs/zh-CN/capabilities.md) · [排障](docs/zh-CN/troubleshooting.md) · [Agent 约定](AGENTS.md) · [MIT 许可证](LICENSE) · [上游归属](THIRD_PARTY_NOTICES.md)
