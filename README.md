# open-chatbot

本地优先（local-first）的多供应商 AI 聊天应用。**纯前端、无自建后端**：对话由浏览器直连按量付费 API，会话历史通过一个**私有 GitHub 仓库**在多端同步。基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)（MIT）二次开发。

- 在线体验：<https://chat.67656.fun>（GitHub Pages 部署）
- 代码仓库：`pirate-608/open-chatbot`（公开，不含任何密钥）
- 数据仓库：独立的**私有**仓库（如 `chatbot-data`），仅存对话，与代码仓库完全分离

## 特性

- 多会话、自动标题、重命名/删除；编辑提问、重新生成、消息分支与续写。
- 流式回答、深度思考；Markdown / 代码高亮 / KaTeX / Mermaid。
- **DeepSeek 官方**（Anthropic 协议）：联网搜索、链接阅读、Files 附件、语音、引用角标，全功能。
- **dashscope / OpenAI 兼容**：思考、base64 图片输入、`enable_search` 联网搜索（来源面板）、浏览器 Web Speech 语音兜底、单独请求自动标题。
- **GitHub 同步**：离线优先（IndexedDB），增量 changelog + 字段级 LWW 合并，一键清空本地缓存重拉。
- 中英双语、深浅主题、移动端布局、ZIP 历史备份。

## 快速开始

需要 Node.js 22.12+ 与 **pnpm 9**（见下方版本约定）：

```sh
pnpm install
pnpm dev        # http://localhost:8090
```

首次使用在「设置」填 API Key；多端同步在「设置 → 同步」填私有数据仓库 + fine-grained PAT，步骤见 [docs/sync-setup.md](docs/sync-setup.md)。

## 供应商

| 供应商 | 协议 | 默认模型 | 说明 |
|---|---|---|---|
| DeepSeek | Anthropic Messages | deepseek-flash | 全功能 |
| dashscope（百炼按量） | OpenAI compatible-mode | qwen3.6-flash | 视觉+思考+搜索；Anthropic 端点对浏览器关跨域，故走 OpenAI |

供应商差异收敛在 `src/services/api/providers.ts` 的 `wire` / `capabilities` 描述符，新增供应商≈加配置。

## 部署

推送到 `main` 触发 [.github/workflows/pages.yml](.github/workflows/pages.yml) 自动构建并部署到 GitHub Pages（自定义域名 `chat.67656.fun`）。

> ⚠️ CI 与本地均钉 **pnpm 9.15.9**（`packageManager` 字段）。不要升级到 pnpm 10+：它不再读 `package.json` 的 `pnpm.patchedDependencies`，会破坏 gittersync 补丁与 frozen-lockfile。

## 数据与隐私

- API Key / GitHub PAT 只存各设备浏览器 localStorage，**不进代码、构建、仓库**。
- 对话存私有数据仓库；公开代码仓库与公开站点不携带任何密钥或对话。
- 访客使用需填自己的 Key / PAT / 数据仓库。

## 构建注意

`pnpm build` 脚本为 unix 写法（`rm -rf` / `NODE_ENV=`），Windows 本地需 `cross-env` 或直接调 rspack；CI（ubuntu）不受影响。

## 文档

- [AGENTS.md](AGENTS.md)：agent 断点续作指南（架构、约定、已知限制、当前进度）。
- [docs/sync-setup.md](docs/sync-setup.md)：同步实测准备清单。
- 上游 demo 历史文档见 [README.zh-CN.md](README.zh-CN.md)。

## 许可

MIT，保留 [LICENSE](LICENSE)。上游 deepseek-ai/chat-demo  likewise MIT；第三方依赖遵循各自许可。