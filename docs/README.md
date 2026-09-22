# Feeder

Feeder 是用户掌控的跨来源内容发现与稍后读产品。主页面用 Jev 的 1–10 标题相关度评分模拟用户想要的 Feed，目标均分可选 1–10；目标越低，筛选越松。它复用已有公开来源采集，保留用户可调兴趣权重、保存和可撤销反馈；**不会自动刷视频或改变其他平台的原生推荐**。详细规划与现状边界见 [Feeder 产品目标](feeder_product_goal.md)。旧 CLI 数据目录与部分接口仍沿用 `feed-gardener` 名称以保持兼容。

> Jev 均分只作用于 Feeder 已采集且允许评分的候选，并显示真实均分与是否达标；没有经过真实用户的推荐质量评估。Google OAuth YouTube 只读连接入口仍可配置，但本地尚未配置 Google 客户端，真实授权未验证。YouTube 官方搜索需要在 Sources 输入 Data API key，或配置服务端 `YOUTUBE_API_KEY`；当前本机未配置。程序不读取平台 Cookie，不执行真实点赞或自动播放。

## 当前功能

- Feeder 主工作台：沿用 arXiv、GitHub、Hacker News 采集和用户主动导入的公开 TikTok/X 单条链接；对允许评分的真实候选逐批调用 Jev，按 1–10 目标均分构建模拟 Feed，显示实际均分、进度和未达标原因。`Open`、`Save for later`、`Hide`、`Not interested` 只影响本地 Feeder；隐藏可撤销，保存进入共享资源库。
- My garden：编辑用户标签 JEV，查看同组附近主题与硬边界；鼠标悬停标题旁的 `?` 可查看详细说明，键盘聚焦同样可用。权重与反馈保存在浏览器本地。
- YouTube 连接：Connections & privacy 的 `Connect to YouTube` 提供配置指引或 Google 授权入口；配置后以只读权限核验频道，可断开并请求撤销。配置字段见 `.env.example`。连接不授权点赞，也不是新目标的前置依赖。

- 简单模式与专家模式：简单模式使用默认策略，专家模式可查看和调整 Feed Gardener 自己的行为权重。
- 来源看板保留原有采集器和公开元数据展示；主 Feed 已复用 Jev 的标题分数，但旧 Agent 动作字段仍只是预览，不执行播放。
- YouTube 搜索：在 Discover → Sources → YouTube 输入 Data API key，或配置服务端 `YOUTUBE_API_KEY` 后，现有采集入口按所选主题取得视频链接。网页输入的 key 只保存在本机服务内存，重启后失效。可嵌入且非 Made for Kids 的链接转换成官方隐私增强播放器，在主页和来源看板显示视频标题与封面。其他结果显示官方标题、封面和回源链接。YouTube 结果不计入 Jev 均分。
- tag 联想：结合内置目录与公开 GitHub topics，只有用户确认后才写入偏好。
- 本地资源库：从发现页收藏，或粘贴任意 HTTP(S) 第三方网页链接；按网站和资源类型组合筛选，可手动修改类型、添加笔记并管理知识状态。粘贴链接只保存地址与用户输入，不抓取页面内容。
- 旧 Agent 预览合同：能力查询、有界计划、多模态观察入口和原生 feed 前后快照评估；保留兼容性，不属于新目标的 MVP 闭环。
- 可选标题评分：程序把视频标题与用户 tags 交给 Jev，转换为 1–10 分相关度后按阈值选择候选动作；无 key 时分数为空并待复核。这不是用户兴趣权重或完整 Feed 排序；Jev 不抓取或播放视频。
- 本地 simulator：演示暂停、恢复、账号切换和不确定回执；所有结果明确标记为模拟。

## 本地启动

需要 Node.js 22.13+ 与 pnpm 11.19.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。macOS 也可以双击项目中的 `Launch.command`。默认不需要 API key、数据库或平台账号；本地偏好和资源保存在当前浏览器，清除站点数据会同时清除这些内容。

可选配置见 [`.env.example`](../.env.example)。服务端密钥不会发送到前端。

## 命令行版本

在项目目录运行 `pnpm cli -- help` 查看完整命令。命令行无需启动网页服务器；同样需要 Node.js 22.13+、pnpm 11.19.0 和安装好的依赖。

```sh
pnpm cli -- catalog tags --domain ai-infrastructure
pnpm cli -- prefs add-tag evaluation
pnpm cli -- feed list --limit 10
pnpm cli -- feed weight agents 0.8
pnpm cli -- discover --limit 10
pnpm cli -- harvest --section academic --limit 10
pnpm cli -- library add https://example.org/article --title "Read later"
pnpm cli -- simulator plan
pnpm cli -- simulator consent yes
pnpm cli -- simulator start
pnpm cli -- simulator tick 5
pnpm cli -- agent plan --platform youtube
pnpm cli -- agent decision --title "Example video" --provider deterministic
```

`--json` 输出供脚本处理的 JSON；通过 pnpm 管道读取时使用 `pnpm --silent cli -- status --json`，避免 pnpm 的运行提示混入输出。`--data /path/to/state.json` 指定单独的数据文件。默认文件是 `$XDG_CONFIG_HOME/feed-gardener/state.json`，未设置该环境变量时使用 `~/.config/feed-gardener/state.json`。文件仅在修改数据时创建，以用户权限写入。CLI 也支持 `saved`、`hidden`、`harvest save`、`social resolve`、`tags suggest/accept`、资源笔记/类型/状态、`agent observe --input`、`agent evaluate --input` 和 `state export/import`，具体参数见 `help`。

CLI 与网页使用不同的本地存储，不会自动同步。在网页的设置中下载“Export local data”，然后运行：

```sh
pnpm cli -- state import-browser --file ~/Downloads/feed-gardener-local-data.json --replace
```

这个导出文件现在包括资源库；早期的导出文件没有资源库记录，导入时会明确提示。导入会替换 CLI 数据，请先用 `pnpm cli -- state export --file ~/feed-gardener-cli-backup.json` 备份。CLI 自己的备份用 `state import --file ... --replace` 恢复。CLI 不读取浏览器 localStorage，也不向浏览器写回数据。

公开采集只返回元数据；`feed` 复用这些真实候选做本地排序与反馈，`feed help` 可查看保存、隐藏、不感兴趣和撤销命令。旧 `discover` 仍排序内置演示素材。`agent` 只提供旧计划、内容观察、标题决策预览和观察评估；`simulator` 的写入只发生在模拟状态。YouTube/Bilibili 账号操作、播放计量和原生推荐改善既未实现，也不是新目标的依赖。

## 接口

所有现有接口都由 [`lib/api-contract.ts`](../lib/api-contract.ts) 统一注册，并使用同一成功/错误包络。开发新需求时必须优先复用或兼容性修改现有接口，非必要不得新增。完整清单、版本和变更规则见 [接口合同](interface_contract.md)。

## 验证

```sh
pnpm typecheck
pnpm test
pnpm build
```

这些检查验证本地代码和 simulator，不证明新目标的真实候选质量或反馈效果，也不验证外部账号操作。

## 项目结构

下面的目录树与 [完整结构页](project_structure.md) 由 `scripts/generate-project-structure.mjs` 同步维护；运行 `pnpm docs:structure` 可手动刷新，常用开发、测试和构建命令也会自动刷新。

<!-- PROJECT_STRUCTURE:START -->
```text
feed_gardener_project_pack/
    ├── .agents/
    │   └── skills/
    │       └── typesafe-ai/
    │           ├── LICENSE
    │           └── SKILL.md
    ├── agents/
    │   ├── feed-gardener/
    │   │   └── SKILL.md
    │   ├── 01_original_reply.md
    │   ├── 02_agent_project_brief.md
    │   ├── AGENTS.md
    │   ├── instruction.md
    │   └── memory.md
    ├── app/
    │   ├── api/
    │   │   ├── agent/
    │   │   │   └── v1/
    │   │   │       ├── capabilities/
    │   │   │       │   └── route.ts
    │   │   │       ├── decisions/
    │   │   │       │   └── preview/
    │   │   │       │       └── route.ts
    │   │   │       ├── evaluations/
    │   │   │       │   └── preview/
    │   │   │       │       └── route.ts
    │   │   │       ├── observations/
    │   │   │       │   └── analyze/
    │   │   │       │       └── route.ts
    │   │   │       └── plans/
    │   │   │           └── route.ts
    │   │   ├── connections/
    │   │   │   └── youtube/
    │   │   │       ├── callback/
    │   │   │       │   └── route.ts
    │   │   │       └── route.ts
    │   │   ├── harvest/
    │   │   │   └── route.ts
    │   │   ├── social/
    │   │   │   └── resolve/
    │   │   │       └── route.ts
    │   │   └── tags/
    │   │       └── suggest/
    │   │           └── route.ts
    │   ├── instructions/
    │   │   └── page.tsx
    │   ├── globals.css
    │   ├── icon.svg
    │   ├── layout.tsx
    │   └── page.tsx
    ├── cli/
    │   ├── cli.test.ts
    │   ├── main.ts
    │   └── state.ts
    ├── components/
    │   ├── DiscoveryGallery.tsx
    │   ├── FeederWorkspace.module.css
    │   ├── FeederWorkspace.tsx
    │   ├── garden.css
    │   ├── Garden.tsx
    │   ├── Onboarding.tsx
    │   ├── ResourceLibrary.tsx
    │   ├── SelectedTagsToggle.tsx
    │   ├── SourceBoards.tsx
    │   ├── WorkspaceSidebar.tsx
    │   ├── youtube-connection.css
    │   └── YouTubeConnection.tsx
    ├── docs/
    │   ├── feeder_product_goal.md
    │   ├── interface_contract.md
    │   ├── project_structure.md
    │   ├── README.md
    │   └── youtube_positive_feedback_design.md
    ├── lib/
    │   ├── crawler/
    │   │   ├── arxiv.ts
    │   │   ├── core.ts
    │   │   ├── github.ts
    │   │   ├── hackernews.ts
    │   │   ├── harvest.ts
    │   │   ├── merge.ts
    │   │   ├── social.ts
    │   │   ├── types.ts
    │   │   └── youtube.ts
    │   ├── agent-observation.test.ts
    │   ├── agent-observation.ts
    │   ├── api-contract.test.ts
    │   ├── api-contract.ts
    │   ├── candidate-decision.test.ts
    │   ├── candidate-decision.ts
    │   ├── crawler.test.ts
    │   ├── feed-observation.test.ts
    │   ├── feed-observation.ts
    │   ├── feed-simulator.test.ts
    │   ├── feed-simulator.ts
    │   ├── feed.test.ts
    │   ├── feed.ts
    │   ├── feeder.test.ts
    │   ├── feeder.ts
    │   ├── garden.test.ts
    │   ├── garden.ts
    │   ├── harvest.test.ts
    │   ├── locale.test.ts
    │   ├── locale.ts
    │   ├── resources.test.ts
    │   ├── resources.ts
    │   ├── strategy.test.ts
    │   ├── strategy.ts
    │   ├── tag-suggestions.test.ts
    │   ├── tag-suggestions.ts
    │   ├── youtube-connection.test.ts
    │   └── youtube-connection.ts
    ├── public/
    │   └── fonts/
    │       ├── dm-sans-0.ttf
    │       ├── dm-sans-1.ttf
    │       ├── dm-sans-2.ttf
    │       ├── dm-sans-3.ttf
    │       ├── dmsans-OFL.txt
    │       ├── libre-caslon-4.ttf
    │       └── librecaslondisplay-OFL.txt
    ├── scripts/
    │   └── generate-project-structure.mjs
    ├── .env.example
    ├── .gitignore
    ├── .prettierignore
    ├── .prettierrc.json
    ├── Launch.command
    ├── next.config.ts
    ├── package.json
    ├── pnpm-lock.yaml
    ├── skills-lock.json
    └── tsconfig.json
```
<!-- PROJECT_STRUCTURE:END -->

## 安全与能力边界

- 不收集平台密码、Cookie 或 session token。
- 不使用私有接口、隐藏播放、伪造观看、验证码规避或代理/账号轮换。
- Agent 行为与用户反馈分开，模拟动作不会改写用户显式偏好。
- 执行成功、账号状态改变和推荐改善分别验证。
- YouTube OAuth access token 只保存在后端内存，不请求 refresh token、不写磁盘、不传给 Jev；会话到期或重启需重连。真实登录仍待 Google 配置后验证。
- 真实平台写入 Runner、播放计量、点赞状态核验和原生效果实验目前尚未实现。

字体随项目本地提供，许可文件位于 [`public/fonts`](../public/fonts)。
