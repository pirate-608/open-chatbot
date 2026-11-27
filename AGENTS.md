# AGENTS.md · 断点续作指南

本文件让 agent 在会话中断后无需重新调研即可继续工作。**先读本文件与所指源码，再动手；遵循最小改动原则，优先复用现有轮子。**

## 1. 项目是什么

open-chatbot：本地优先、纯前端、无自建后端的多供应商聊天应用。
- 对话：浏览器直连按量付费 API（DeepSeek=Anthropic 协议；dashscope/第三方=OpenAI compatible-mode）。
- 同步：会话写入**私有 GitHub 数据仓库**（gittersync），多端共享；离线优先 IndexedDB。
- 部署：公开代码仓库 `pirate-608/open-chatbot` → GitHub Pages（`chat.67656.fun`）。数据仓库独立私有（如 `chatbot-data`）。
- 上游：deepseek-ai/chat-demo（MIT），remote `upstream`；`origin`=用户仓库。

## 2. 环境与命令（版本约定很重要）

- Node 22+；**pnpm 钉 9.15.9**（`packageManager` + CI）。**勿升 pnpm 10+**：不读 `package.json` 的 `pnpm.patchedDependencies`，破坏补丁与 frozen-lockfile。
- `pnpm install` / `pnpm dev`(8090) / `pnpm type`(tsc) / `pnpm lint`(oxlint)。
- `pnpm build` 脚本是 unix 写法；Windows 本地需 cross-env，CI(ubuntu)正常。
- TS strict + NodeNext：import 用 `.js` 后缀、类型用 `import type`；noUnusedLocals/Parameters 开启。
- 提交/推送：`git push origin main`（SSH）。**workspace-write 沙箱会拒 `.git` 写入**，git 命令需 `sandbox_permissions: danger-full-access`。
- 推送后 CI 自动部署；用 `gh run watch <id> --exit-status` 验证。

## 3. 架构地图（规范内部模型为枢纽）

上层 store/UI 只认 **Anthropic 形状的 `CreateMessageRequest` + 内部块事件**；供应商差异收敛到 `providers.ts` 的 `wire`/`capabilities`，协议适配器负责翻译。

- `services/api/`
  - `transport.ts`：`ApiError`/`request`/`readErrorResponse`（通用传输，独立成模块解环）。
  - `client.ts`：Anthropic 客户端 + `streamMessage` 分派（openai→`streamOpenAI`）。
  - `openai.ts`：chat/completions 适配器（SSE→块事件）、`generateTitle`（单独请求标题）。
  - `providers.ts`：`Provider`/`ProviderWire`/`ProviderCapabilities` + `useProvider`/`getProvider`/`setProvider`。
  - `types.ts`：规范块模型（含 `ImageBase64BlockParam`/`ImageDataMap`/`enableSearch`）。
  - `sse.ts`/`parseEvent.ts`/`speech.ts`/`errors.ts`。
- `services/chat/`：`store.ts`（请求构建/标题钩子/imageData）、`reply.ts`（`applyEvent`/`toRequestMessages`/`toUserParam`）、`db.ts`（本地 idb）、`backup.ts`、`types.ts`。
- `services/storage/`：`port.ts`(`ChatStorage` 接口)、`idb.ts`、`backend.ts`、`index.ts`(facade)。store/backup 以 `import * as db from '../storage/index.js'` 使用。
- `services/sync/`：`engine.ts`(gittersync 包装)、`codec.ts`(Session↔文档，**每条消息一个文档**)、`git-storage.ts`、`settings.ts`、`bootstrap.ts`(`initStorage`/`syncNow`/`resetSync`)。
- `services/speech/webSpeech.ts` + `components/chatInput/useVoiceInput.ts`(Web Speech 输入兜底) + `services/speech/readAloud.ts`(speechSynthesis 兜底)。
- UI 门控：`ChatInput.tsx` 按 `caps` 显隐思考/搜索/附件；`settings/SyncSettings.tsx`、`sider/SyncStatusBadge.tsx`。

## 4. 关键决策与不可破坏的约定

1. **gittersync 补丁** `patches/gittersync@1.5.2.patch`：修 REST 读路径 `JSON.parse(atob())`→`decodeBase64Utf8`（私有库强制 REST，否则中文乱码）。**勿删补丁**；升级 gittersync 需重验该读路径。
2. **消息按文档同步**（per-message doc + sessions 集合），避免整会话单字段被 LWW 覆盖丢消息。
3. **CORS 事实**（已实测）：DeepSeek anthropic 开跨域；dashscope **anthropic 关跨域**(预检403/401)→必须 OpenAI compatible-mode（开跨域）。workspace id 非必需。
4. dashscope 默认 `qwen3.6-flash`（视觉+思考）；搜索自动切 `wire.searchModel`=qwen-flash（见 6）；qwen-flash 纯文本无视觉。
5. 能力门控：`caps.search/thinking/vision/files/voice` 决定 UI 与请求降级；DeepSeek 专有工具仅 anthropic 协议声明。
6. 搜索引用=**来源面板**（合成 `web_search_tool_result` 块自 `search_info.search_results`，需 `search_options.enable_source`）；**无行内引用角标**（协议不返回位置）。
   - **多模态模型搜索形态**：qwen3.6 等多模态系列的 `enable_search` 仅在 content 为**数组**（多模态形态）时生效；纯字符串 content 走文本路径会静默忽略搜索。`toOpenAIMessages(body, multimodal)` 对 base64-image-url 供应商把 user content 包成 text-part 数组。
   - **兼容端点搜索仅文本模型**：compatible-mode 的 `enable_search` 只对文本模型生效（多模态搜索需原生 multimodal 端点，浏览器不可用）。故 `wire.searchModel`（dashscope=qwen-flash）：纯文本+搜索时自动切文本搜索模型；带图时用视觉模型并跳过搜索。
7. 附件：openai 走 base64 `image_url`、`uploadAttachment` 对非 files-api 供应商 no-op；**历史图片降级省略**；文档附件 openai 不支持；链接阅读 DeepSeek 独有。
8. 语音：第三方用 Web Speech（识别依赖浏览器）+ speechSynthesis（朗读）。
9. 含搜索的回复不可续写（与 DeepSeek 一致）。

## 5. 当前进度（已完成，勿重做）

- 同步核心+设置 UI/徽标+一键重置；UTF-8 补丁；pnpm 钉版。
- P1 wire+门控；P2 单独标题+余额归类；P3 base64 图片；P4 enable_search 来源+Web Speech。
- 提交链（新→旧）：`c55bd47`(P4) `2241989`(P3) `5bfd23e`(P2) `8eb7cc5`(P1) `2eaf3c6`(pnpm钉) `045dd26`(UTF-8补丁) `e9f9b28`(重置按钮) `fa03de4`(dashscope openai) `616810c`(首提)。

## 6. 可选待办（未做，按需）

GitHub Action 维护（压缩/备份）；行内引用角标；文档附件；模型下拉(/models)；语音在移动 Safari 的识别兜底。（按供应商存 API key 已完成。）

## 7. 限流与中断注意

- 宿主 **auto-review 审查模型用百炼**，配额/TPM 限流会 `429 insufficient_quota` 中断工具调用（fail-closed，**命令未执行、无副作用**）。重试即可；**减少冗余调研**以省配额。
- 读/写工具偶发同样的 429，重试一次通常恢复。
- 每阶段流程：改码→`pnpm type`+`pnpm lint`→commit→push(danger-full-access)→`gh run watch` 验证。

## 8. 验证方式

线上硬刷新 chat.67656.fun 选供应商实测；本地 `pnpm dev`。同步实测需私有数据仓库+PAT（docs/sync-setup.md）。