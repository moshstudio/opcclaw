<div align="center">
  <img src="./resources/icon.png" width="100" height="100" alt="OpcClaw Logo">
  <h1>OpcClaw (猫爪)</h1>
  <p><b>多渠道、可扩展的跨平台高度智能化 AI 助手平台</b></p>

  [![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/moshstudio/opcclaw)
  [![Electron](https://img.shields.io/badge/Electron-39.2.6-47848F.svg)](https://www.electronjs.org/)
  [![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
  [![Ant Design X](https://img.shields.io/badge/Ant%20Design%20X-2.4.0-1677FF.svg)](https://x.ant.design/)
  [![License](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-lightgrey.svg)](LICENSE)
</div>

---

## 🌟 项目简介

**OpcClaw (猫爪)** 是一款基于 Electron 开发的高性能 AI 智能体平台。它不仅提供了一个优雅的桌面聊天界面，更核心的能力在于其强大的**多渠道集成**与**可扩展的技能系统**。你可以通过飞书、Telegram、QQ 等多个平台与你的 AI 智能体进行交互，并赋予它们执行代码、浏览网页、定时执行任务等高级功能。

## ✨ 核心特性

- 🤖 **多平台渠道支持**:
  - **飞书 (Lark)**: 深度集成飞书卡片消息与交互。
  - **Telegram**: 高性能的机器人交互体验，支持多级菜单。
  - **QQ**: 兼容 QQ 机器人协议，覆盖更多用户群体。
- 🧩 **强大的技能系统 (Skills)**:
  - **Slash Commands**: 支持通过 `/` 命令快速触发特定技能。
  - **动态加载**: 内置对 Composio 等外部技能库的支持，支持动态同步 GitHub 仓库。
- 👥 **智能协作体系**:
  - **子代理 (Subagents)**: 支持智能体在任务中自动生成并管理子代理，实现复杂任务的并行处理。
  - **交互确认 (Interactions)**: 敏感操作执行前，AI 会通过渠道主动向你请求确认或选择。
- 🌐 **内置工具集**:
  - **浏览器自动化**: 基于 Playwright，支持 AI 实时上网搜索与网页抓取。
  - **代码执行**: 安全沙箱环境下的代码执行能力。
  - **文件处理**: 灵活的读写、编辑与管理工作区文件。
- ⏰ **定时任务 (Heartbeat)**:
  - 通过工作区中的 `HEARTBEAT.md` 灵活配置任务流程，支持定时自动唤醒并通报。
- 🧠 **高级记忆管理**:
  - 完善的对话历史管理，支持长短期记忆，具备智能历史压缩与 Token 管理能力。
- 🎨 **卓越的 UI/UX**:
  - 基于 **Ant Design X** 构建的现代化聊天界面。
  - 支持深色/浅色模式切换，流畅的微交互动画。
- 📊 **详尽的用量统计**:
  - 深度追踪 Token 消耗、成本支出、响应延迟、吞吐率及缓存表现。

## 🛠️ 技术栈

- **前端**: React 19, Tailwind CSS, Ant Design (X, Pro), Framer Motion, Zustand
- **后端 (主进程)**: Node.js, Electron, Playwright, Pino (Logging)
- **集成**: Grammy (Telegram SDK), Lark SDK (Feishu), PI-AI (Agent Runtime)
- **构建工具**: Vite, Electron-Vite, pnpm

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) (建议 v18+)
- [pnpm](https://pnpm.io/) (建议 v8+)

### 安装依赖

```bash
git clone https://github.com/moshstudio/opcclaw.git
cd opcclaw
pnpm install
```

### 开发模式

```bash
pnpm dev
```

### 构建应用

```bash
# 构建 Windows 版本
pnpm build:win

# 构建 macOS 版本
pnpm build:mac

# 构建 Linux 版本
pnpm build:linux
```

## ⚙️ 配置说明

应用启动后，配置文件将存储在用户目录下的 `.opcclaw` (正式版) 或 `.opcclaw-dev` (开发版) 文件夹中。

- **工作空间**: 每个智能体都有独立的工作目录。
- **配置项**:
  - **模型配置**: 支持 OpenAI, Anthropic, Gemini, DeepSeek, 智谱 GLM, 月之暗面 Kimi, Groq 等主流驱动。
  - **网关配置**: 默认监听 `18781` 端口，用于外部回调与数据同步。

## 📂 项目结构

```text
src/
├── main/          # Electron 主进程逻辑 (服务、渠道、智能体 runtime)
│   ├── services/  # 核心业务服务 (Config, Agent, Channels, Tools, etc.)
│   └── index.ts   # 入口文件
├── renderer/      # React 渲染进程逻辑
│   ├── src/
│   │   ├── components/  # UI 组件 (Chat, Settings, UI Library)
│   │   ├── store/       # 状态管理
│   │   └── App.tsx      # 应用主入口
├── shared/        # 主进程与渲染进程共享的类型与工具函数
└── preload/       # Electron 预加载脚本
```

## 🤝 贡献指南

我们欢迎所有形式的贡献！无论是提交 Bug 反馈、需求建议，还是直接提交 PR 完善代码。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 开源协议

本项目采用 **CC BY-NC-SA 4.0** (署名-非商业性使用-相同方式共享 4.0 国际) 协议。

- **个人用户**：可免费使用、学习和修改。
- **商业用途**：**严禁任何形式的未经授权商用**。如需商业授权，请联系作者。

详情请参阅 [LICENSE](./LICENSE) 文件。

---

<div align="center">
  <p>By <b>Mosh Studio</b> </p>
</div>
