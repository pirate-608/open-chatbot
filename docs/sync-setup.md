# GitHub 同步 · 实测准备清单（任务 3g）

本文档列出跑通"多端同步实测"前你需要准备的东西。全部在 GitHub 网页上完成，约 5 分钟。

## 1. 建一个私有数据仓库

同步会把对话写进一个 GitHub 仓库，**建议专用数据仓库，不要和代码仓库混用**。

1. 打开 https://github.com/new
2. 填写：
   - **Repository name**：例如 `chatbot-data`（记住 `owner/repo`，如 `yourname/chatbot-data`）
   - **Visibility**：⚠️ 必须选 **Private**（公开仓库 = 对话公开）
   - 勾选 "Add a README file"（让仓库有一个初始 commit，分支为 `main`）
3. Create repository。

> 分支默认 `main`。若你的仓库默认分支是 `master` 或其他，在应用设置里改成对应名字。

## 2. 创建 Fine-grained PAT（最小权限令牌）

1. 打开 https://github.com/settings/personal-access-tokens/new
   （路径：Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token）
2. 填写：
   - **Token name**：例如 `chatbot-sync`
   - **Expiration**：建议 90 天或更长（到期需在应用里更新令牌）
   - **Resource owner**：你自己
   - **Repository access**：选 **Only select repositories** → 选中第 1 步的 `chatbot-data`
   - **Permissions → Repository permissions**：
     - **Contents**：**Read and write**（读写对话文件，必需）
     - **Metadata**：Read-only（选 Contents 后会自动带上，必需）
     - 其余权限一律不给
3. Generate token，**立刻复制**（页面关闭后不再显示）。

> 也可以用 classic token（勾 `repo` scope）更省事，但权限范围大；fine-grained 限定单仓库、最小权限，更推荐。

## 3. 安全须知

- 令牌和 API Key 同一模型：**每台设备各自在应用设置里填写，存浏览器 localStorage**，不进代码、不进构建、不进仓库。
- 应用部署在公开静态托管（如 GitHub Pages）也安全：访客填访客自己的令牌，你的令牌只在你设备的浏览器里。
- fine-grained 令牌即使泄露，对方也只能读写这一个数据仓库，碰不到你的代码或账号。
- 令牌过期后同步会失败并自动回退本地存储；重新生成并在设置里更新即可。

## 4. 在应用里启用同步

设置 → 同步（3f 正在加的界面）：

| 字段 | 填什么 |
|---|---|
| 启用同步 | 打开 |
| Owner | 你的 GitHub 用户名 |
| Repo | `chatbot-data` |
| Branch | `main` |
| Token | 第 2 步复制的 PAT |

保存后应用会初始化同步、拉取远端、开始自动同步（每 60 秒 + 切回前台即同步）。

## 5. 多端实测步骤

1. **设备 A**（电脑浏览器）：启用同步，新建会话发几条消息。
2. 打开 GitHub 仓库，应看到：
   ```
   meta.json
   collections/sessions.json      会话元数据
   collections/messages.json      消息（每条一个文档）
   changelog/<时间>_<设备>.json    增量变更
   files/                         附件（≤1 MiB）
   ```
3. **设备 B**（手机浏览器，或另一浏览器/隐身窗口模拟）：填同一个 `owner/repo` + 同一个 PAT，启用同步。
4. 设备 B 应拉到设备 A 的会话历史。
5. **双向验证**：B 发新消息 → A 切回前台/等自动同步后应看到；反之亦然。
6. **冲突验证**（可选）：A、B 同时给同一会话各发一条 → 两条都应保留（消息按文档独立合并）。
7. **离线验证**（可选）：断网发消息 → 恢复网络后自动补推。

## 6. 观察同步状态徽标

界面会显示：同步中 / 在线 / 待推送变更数 / GitHub 剩余配额 / 上次同步时间。
读文件走 `raw.githubusercontent.com`，不占 REST 5000 次/小时限额；只有写入和增量比较消耗配额。

## 7. 已知边界（v1）

- 附件 **>1 MiB 不上云**（GitHub Contents API 单文件上限），仅留本地引用。
- 同步模式下 demo 原有的"历史 ZIP 导入"不支持，改用同步自带的备份导入/导出。
- 国内访问 GitHub 有延迟，同步非实时（轮询 + 前台触发）。
- 删除为软删除，保留 30 天后由压缩清理，避免未同步设备"复活"已删会话。

## 8. 可选：GitHub Action 维护（后续任务）

gittersync 已在客户端 push 时自动压缩 changelog。Action 仅用于可选的定时备份 / git 历史瘦身，不是同步必需，可最后再做。