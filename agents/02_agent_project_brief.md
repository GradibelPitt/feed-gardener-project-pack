# Feed Gardener：开发 Agent 执行规格

规范版本：0.1  
项目代号：Feed Gardener（暂定名，不代表已经确认可用的品牌）  
目标读者：负责架构、编码、测试和交付的开发 agent。  
配套文件：`01_original_reply.md`，上一条技术方案的完整原文。  
交付状态：本文件是待实施的项目规格，不是已实现代码、测试报告或平台授权证明。

## 0. 执行本文件前必须理解的要求

用户要的是一款让个人主动选择信息偏好，并逐渐把社交媒体推荐养成自己想要的样子的产品，不是又一个视频摘要器。

用户明确提出两个模式：

- **模式 A — Aggregate / Discover：** 根据领域、标签、关联领域和内容偏好，自动发现并聚合多个平台上的相关视频。
- **模式 B — Native Feed Gardening：** 用户登录指定平台账号，软件在获准范围内执行与偏好一致的操作，目标是改善这个账号在原平台获得的推荐，而不仅是改变我们自己显示的列表。

两者使用同一份偏好，但必须分别衡量是否有效。不能把 A 做完以后宣称 B 已实现，不能把网页隐藏、重排、摘要、自动订阅或模拟站点演示单独冒充完整的原生 feed 调校。

`01_original_reply.md` 是只读历史记录。不要纠正、重排、删减或更新其中任何内容。本文件补充工程契约，并把设计参数、待验证假设、平台能力与已知边界分开。原文中的接口配额、政策解释、模型可用性和第三方兼容性不是永久事实；实现 agent 必须在依赖这些信息前查阅当时的官方文档和实际项目配置，并把结果写入新文件，不能覆盖原文。

本文件使用以下规范词：**MUST** 表示必须满足；**MUST NOT** 表示禁止；**SHOULD** 表示默认执行，偏离时需要 ADR（架构决策记录）说明。未注明已经实测的性能、阈值、频率和容量均为初始工程设置。

## 1. Project Goal

### 1.1 产品目标

构建一个由用户控制的信息偏好系统，通过结构化标签、显式反馈和受约束的本地执行，降低用户找到相关技术视频的成本，并验证原生平台推荐能否持续变得更符合用户的主动目标。

用户不需要自己写 prompt、维护脚本或理解 agent 工具链。用户应当能完成这个流程：

```text
选领域 → 选标签 → 选允许探索的相邻领域 → 设置不想看的内容
   ↓
查看聚合内容，纠正推荐原因
   ↓
绑定一个已登录的本地平台账号
   ↓
查看实际可用动作，授权具体运行范围
   ↓
启动、观察、暂停调校
   ↓
回到原平台，检查原生推荐是否真的改善
```

“用户意图”优先于“点击最多的内容”。一次误点不能覆盖明确偏好，软件执行过的观看不能被学成用户喜欢。

### 1.2 第一版服务对象与范围

第一版面向希望关注开发、AI、开源项目与相关技术动态的桌面用户。用户界面支持中文和英文，标签目录与内容匹配支持中英交叉。

固定范围：Web 控制台、桌面 Chrome 扩展、Python 后端、共享的合规内容索引。A 接入 YouTube、Bluesky 视频帖、作者 RSS；GitHub 与 Hacker News 仅辅助发现项目和视频链接。B 先实现 YouTube 能力适配和模拟站点上的完整执行器，再在落实真实平台允许路径后做授权验证。

不在第一版范围：移动端后台控制、云端持有用户浏览器账号、全平台个人首页导入、自动评论、自动点赞、批量清空历史、绕过平台限制、通用任意网页 agent、广告变现或以停留时长作为优化目标。

### 1.3 成功与失败的定义

A 的成功：目标用户认为推荐有用，明确屏蔽有效，重复信息减少，推荐理由可验证，更新和成本可控。

B 的成功：在授权、允许的实验中，关闭我们自己的过滤和重排后，原平台首页的推荐相较对照或基线改善，并且账号安全、用户控制和来源多样性没有明显退化。

B 的失败或未验证：平台操作无允许路径；只能展示层过滤；模拟站有效但原平台没测；只统计执行次数而不评估结果；改善可能完全来自用户自行改变行为且没有对照。必须明确报告这些情况。

## 2. 不可破坏的工程约束

1. **行为来源隔离。** `user`、`agent`、`system` 是不同 actor；只有允许的用户事件才能更新学习偏好。
2. **显式偏好最高优先。** 学习值独立存储，不覆盖用户手选标签、排除列表或探索范围。
3. **不偷换产品目标。** A、B 模拟器、B 真实连接、B 效果验证分别记录完成状态。
4. **本地平台身份。** 不收集社交平台密码，不上传 Cookie，不远程托管用户完整浏览器会话。
5. **操作有边界。** 每次写操作都绑定用户、设备、平台身份、具体动作、偏好版本、同意版本、策略版本和有效期。
6. **不确定就暂停写入。** 身份不清、权限不清、页面不匹配、结果未知、预算耗尽或 lease 失效时，不继续修改账号。
7. **LLM 无操作权限。** 模型仅输出受 schema 约束的分析；不能执行模型提供的代码、任意 URL 或 DOM 选择器。
8. **平台许可独立于用户同意。** 用户愿意登录不代表平台允许一切；内部 feature flag 不是授权证据。
9. **不伪造观看与效果。** 不为积累播放量或历史信号而制造隐藏播放，不声称元数据分析等于看完整个视频。
10. **隐私隔离。** 私人订阅、账号绑定、反馈、运行数据、知识状态和私有内容的分析结果不能泄露到公共索引。
11. **任务允许重投但不盲目重做。** 内部用幂等键；外部副作用用核验与人工恢复，不能宣称端到端绝对 exactly-once。
12. **不绕过限制。** 不使用代理轮换、账号轮换、验证码规避、非公开接口逆向或浏览器隐匿策略补齐平台能力。

## 3. 技术选型与版本策略

以下选型是本项目决策，不是对所有项目最优的结论。保持一个单体业务后端和几个 worker，不建立通用多 agent 编排平台。

| 层 | 选型 | 责任边界 |
|---|---|---|
| Web | Next.js、React、TypeScript | 控制台，不执行平台账号操作 |
| UI | Tailwind CSS、shadcn/ui | 双语表单、列表、状态、权限说明 |
| 表单 | React Hook Form、Zod | 前端表单校验与交互 |
| API 缓存 | TanStack Query | feed、版本化偏好、状态轮询 |
| Extension | WXT、React、TypeScript、Manifest V3 | 真实本地浏览器执行、side panel |
| 本地持久化 | Dexie / IndexedDB | 状态机、动作日志、同步 outbox |
| Python API | FastAPI、Pydantic 2 | 业务契约、认证、推荐、任务 |
| ORM | SQLAlchemy 2、psycopg 3、Alembic | 显式事务、迁移、RLS 上下文 |
| DB / Auth / Storage | Supabase PostgreSQL、pgvector、Auth、私有 Storage | 数据、产品账号、授权素材 |
| Worker | Celery、Redis、Celery Beat | 采集、分析、清理、调度 |
| 网络采集 | HTTPX、feedparser、平台官方 API | 有预算、检查点和来源政策的接入 |
| Embedding | intfloat/multilingual-e5-small、sentence-transformers | 候选召回；固定模型 revision |
| LLM | OpenAI SDK、gpt-4.1-mini-2025-04-14 初始配置 | 结构化特征提取；上线前核实可用性 |
| 可选媒体处理 | FFmpeg、faster-whisper | 只处理允许接入的媒体；独立 optional worker |
| 测试 | pytest、Vitest、Playwright | 业务、扩展和模拟站点测试 |
| 运维 | Docker Compose、GCP Compute Engine、Caddy、Sentry | 部署、TLS、错误与指标 |
| JS 工具链 | pnpm、ESLint、Prettier | workspace、锁文件、lint |
| Python 工具链 | uv、Ruff、mypy | 依赖锁定、格式与类型检查 |

运行时初始基线设为 Node.js 22 和 Python 3.12。它们是构建目标，不代表“最新版本”；若所选库实际不兼容，agent 必须基于官方兼容信息写 ADR 后调整。

MUST 提交 `pnpm-lock.yaml`、`uv.lock`、数据库迁移与模型 revision。第一次搭建时确定库的精确版本，提交后不能依赖漂移的 `latest`、未固定 Git 分支或 Docker tag。版本变更需要通过 CI。

原文采用的模型若不可用：模型接口保持稳定，记录阻塞与替换理由，通过固定评测集后切换；不得静默换模型后沿用旧评测成绩。

## 4. 仓库结构与模块责任

```text
feed-gardener/
├── AGENTS.md
├── README.md
├── .env.example
├── .gitignore
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── pyproject.toml
├── uv.lock
├── apps/
│   ├── web/
│   │   ├── app/[locale]/onboarding/
│   │   ├── app/[locale]/feed/
│   │   ├── app/[locale]/garden/
│   │   ├── app/[locale]/settings/connections/
│   │   └── components/
│   └── extension/
│       ├── entrypoints/background.ts
│       ├── entrypoints/youtube.content.ts
│       ├── entrypoints/sidepanel/
│       └── src/
│           ├── auth/
│           ├── adapters/{types,youtube,simulator}/
│           ├── machine/
│           ├── policy/
│           ├── storage/
│           └── sync/
├── packages/
│   ├── api-client/                 # OpenAPI 生成，只通过 generator 修改
│   ├── ui/                         # 通用 UI，不包含平台执行能力
│   └── taxonomy-types/
├── services/
│   └── backend/
│       ├── app/
│       │   ├── api/v1/
│       │   ├── auth/
│       │   ├── db/
│       │   ├── schemas/
│       │   ├── connectors/
│       │   ├── services/
│       │   │   ├── taxonomy.py
│       │   │   ├── trends.py
│       │   │   ├── embedding.py
│       │   │   ├── classification.py
│       │   │   ├── ranking.py
│       │   │   ├── policy.py
│       │   │   └── evaluation.py
│       │   └── workers/
│       ├── alembic/
│       └── tests/
├── data/
│   ├── taxonomy/{domains,tags,relations}.yaml
│   └── fixtures/                   # 合成或有权使用的数据；不提交真实账号数据
├── simulator/                     # 自有推荐流站点、身份切换和故障注入
├── evals/
│   ├── datasets/
│   ├── protocols/
│   └── reports/
├── infra/
│   ├── compose.dev.yml
│   ├── compose.prod.yml
│   ├── Caddyfile
│   └── docker/
├── scripts/
│   ├── dev.py
│   ├── dev.ps1
│   ├── dev.bat
│   └── validate_taxonomy.py
├── docs/
│   ├── original/                   # 本次两份 MD 的只读副本
│   ├── adr/
│   ├── capability-matrix.md
│   ├── verification-log.md
│   ├── threat-model.md
│   ├── api/openapi.json
│   └── release-status.md
└── .github/workflows/
```

不复制业务 schema 到三个工程里分别维护。Pydantic 生成 OpenAPI；使用 `openapi-typescript` 生成类型，`openapi-fetch` 封装请求。Zod 处理表单层约束，业务规则和权限最终仍由后端校验。

`AGENTS.md` MUST 指向本规格，并强调：不得修改原文、不得伪装平台支持、不得混用 agent/user 行为、不得把模拟成功写成真实平台成功。

## 5. 系统边界与数据流

```text
公共来源 ──connector──> source policy ──> 内容标准化与去重
                                          ↓
                                  允许的表示与分析
                                          ↓
偏好目录 ──> 用户显式偏好 ──> 候选召回 → 个性化排序 → Web feed
                   ↑                               ↓
                   └────── 允许学习的用户反馈 ──────┘

同一偏好 ──> 受约束计划 ──> 用户同意＋平台策略＋账号核验
                                   ↓
                              本地 Extension
                                   ↓
                       观察 → 动作 → 核验 → checkpoint
                                   ↓
                         最小化回执与真实效果评估
```

云端可以管理任务、候选和同意记录，但不能发送任意执行脚本。扩展只接受编译进发布包的动作枚举和经过校验的数据。

A 的探索默认不触碰用户的平台历史。B 使用置信度较高且有权使用的候选；不得为了筛选而在用户账号里自动播放大量不确定内容。

## 6. 偏好与标签的具体契约

### 6.1 标签目录

第一批种子目录目标：6 个主要领域、约 80 个稳定主题标签，并为各领域维护有限数量的相邻关系。数量只是交付范围，不是质量指标；宁可合并同义词，也不凑数。

初始主要领域：AI 基础设施、后端与分布式系统、开发者工具、开源应用、Web 与交互技术、机器人与边缘计算。初始目录不得混入无法确认含义的模型生成术语。

标签必须有不可变 ID、中英名称、类型、别名、状态和目录版本。类型分为 `domain`、`topic`；新项目或新框架默认先作为 `entity`，不必立刻成为正式 topic。

`parent` 边要求有向无环；`related` 边单独存储，并明确方向或成对发布。废弃标签保留 `replaced_by`，历史偏好通过迁移解析，不破坏历史记录。

目录验证至少覆盖：ID 唯一、别名归属冲突、父节点存在、父子图无环、权重在 [0,1]、中英标签齐全、废弃标签迁移目标有效。只在事务完成后发布新 `taxonomy_version`。

### 6.2 PreferenceProfile

以下是请求结构示例，不是为当前用户自动创建的偏好：

```json
{
  "schema_version": 1,
  "expected_profile_version": 0,
  "taxonomy_version": "seed-1",
  "domains": ["domain.ai_infrastructure"],
  "tag_preferences": [
    {
      "tag_id": "topic.local_inference",
      "preference": "like",
      "strength": 1.0
    }
  ],
  "allowed_related_domains": ["domain.developer_tools"],
  "exploration_ratio": 0.2,
  "preferred_formats": ["demo", "tutorial"],
  "preferred_depths": ["intermediate", "advanced"],
  "soft_disliked_formats": ["news"],
  "blocked_tag_ids": [],
  "blocked_source_ids": [],
  "preferred_languages": ["zh", "en"],
  "trend_window_hours": 168,
  "discovery_budget_minutes": 25
}
```

写请求不接受客户端指定 `user_id`、`origin=learned`、最终 `profile_version` 或权限字段。服务端从认证上下文取得用户，成功保存后递增版本并返回完整 profile。

用户主动硬屏蔽与软偏好分开。`discovery_budget_minutes` 表示用户阅读预算，不是自动播放时长授权；B 的动作与运行预算在 consent 中另外定义。

更新采用 optimistic concurrency：`expected_profile_version` 过期返回 `409 PROFILE_VERSION_CONFLICT`。存储 immutable profile revision；进行中的 B run 固定引用一个版本，发现变化后暂停，等待重新计划与确认。

### 6.3 新标签与趋势

`discover_tag_candidates` 默认每 6 小时运行。候选保存至少一个来源记录和提取证据；跨内容合并时使用项目原链接、规范化名称与别名，不凭名字相同合并不同项目。

默认审核入口条件为最近 7 天至少 5 条去重内容、3 个独立作者，并有可确认的实体。多个平台转发同一作者的同一内容只计一次；无法辨别独立性时保守去重。未达到条件仍可显示为内容中提到的实体，但不是正式领域标签。

`compute_tag_trends` 默认每小时运行，面向每个领域计算：

```text
recent_share   = 最近24小时该标签去重内容数 / 该领域最近24小时去重内容数
baseline_share = 之前7天该标签去重内容数 / 该领域之前7天去重内容数
trend_score    = log((recent_share + ε) / (baseline_share + ε)) × diversity_factor
```

ε、最小样本量与去重规则配置化并版本化。默认近 24 小时领域样本少于 30 条或标签独立作者少于 3 个时，标记 `insufficient_data`，不输出醒目的趋势排名。`diversity_factor` 初始为 `min(1, independent_publishers / 5)`。

跨领域不可直接比较这个分数。页面必须展示样本窗口、来源覆盖与“在已接入来源中升温”。趋势计算只提供候选，不修改用户显式偏好。任务中断时标记过期，不把昨天的数据标成实时。

## 7. 数据库设计

### 7.1 通用约定

主键使用 UUID，平台原 ID 单独存文本，时间统一 `timestamptz`，API 使用 ISO 8601 UTC。私有业务表必须有 `user_id`，公共表不能通过私有关联反推用户兴趣。

核心关系使用外键，跨租户引用通过复合约束或服务端强校验阻止。`(user_id, id)` 可用于需要租户一致性的外键。JSONB 用于结构化载荷，不代替所有索引和关系。

对于可能公共也可能私有的内容表示，必须记录 `visibility_scope` 和 `owner_user_id`。只有政策允许公共复用的表示才能进入共享检索。数据库内部去重命中不能向别的用户暴露私有素材是否存在。

### 7.2 主要表与约束

| 表 | 核心字段与约束 |
|---|---|
| `taxonomy_versions` | version、checksum、published_at；已发布版本不可覆盖 |
| `tags` | tag_id、kind、labels、status、replaced_by |
| `tag_aliases` | tag_id、locale、normalized_alias；冲突审核 |
| `tag_edges` | from_id、to_id、edge_type、weight、taxonomy_version |
| `tag_candidates` | entity_key、evidence、publisher_count、review_status |
| `tag_trend_snapshots` | tag/domain/window、score、counts、coverage、formula_version |
| `profiles` | user_id 主键、current_version |
| `profile_revisions` | (user_id, version) 唯一、profile_json、schema_version |
| `user_tag_preferences` | user_id、tag_id、origin、preference、strength；explicit/learned 分开 |
| `user_known_entities` | user_id、entity_id、known_version、evidence_event_id；不接受 agent 检查事件 |
| `sources` | platform、external_id、canonical_url、visibility、owner、health |
| `source_policies` | source/operation、decision、basis、reviewer、version、expires_at |
| `source_checkpoints` | source/query_key、cursor、etag、last_modified、last_success |
| `content_items` | (platform, external_id) 唯一、元数据、content_hash、刷新与删除状态 |
| `content_representations` | content_id、scope/owner、kind、input_hash、model/prompt/policy revision |
| `content_chunks` | representation_id、chunk_index、text、vector(384)、coverage |
| `content_tags` | representation_id、tag_id、evidence、analysis_status |
| `entities` | entity_id、kind、canonical_key、name、version |
| `content_entity_links` | content_id、entity_id、relation、source_evidence |
| `feedback_events` | event_id 唯一、user_id、actor、reason、content_id、schema_version |
| `feed_sessions` | user_id、profile/taxonomy/ranking_version、candidate_cutoff、created_at |
| `feed_entries` | session_id、rank、content_id、features、explanation、content_version |
| `devices` | user_id、device_id、credential_hash、last_seen、revoked_at |
| `platform_bindings` | user_id、device_id、platform、stable_account_id、verification_status |
| `consents` | user_id、binding、allowed_actions、target_scope、budgets、versions、expires_at |
| `runs` | user_id、device/binding、profile/consent/policy version、state、revision |
| `actions` | action_id 唯一、run_id、type、target、fencing_token、status、expires_at |
| `action_receipts` | (action_id, receipt_seq) 唯一、前后核验证据、result、actor=agent |
| `feed_snapshots` | user_id、binding、surface、capture_method、content IDs、exclusion_reason |
| `outbox_jobs` | job_id、idempotency_key 唯一、payload_ref、dispatch_status |
| `usage_ledger` | provider、project、bucket、window、reserved/actual、request_id |
| `deletion_jobs` | user_id、requested_scope、status、completed_steps、failure_reason |

### 7.3 RLS 与数据库连接

Web/扩展优先通过 FastAPI 访问业务表，不向客户端暴露 service-role key。私有 Storage 同样要有隔离策略，不能依赖“桶是私有的”就结束。

FastAPI 使用非所有者、无 `BYPASSRLS` 的 DB role；每个事务开始设置经过 JWT 验证的用户上下文，结束事务自动清理。可以采用专用 `app.user_id` session-local 设置与匹配的策略；不假设直连 psycopg 会自动获得 Supabase HTTP 层的身份上下文。

后台公共采集使用受限 role；私有任务显式设定 owner 并经过同一隔离规则。迁移凭证与运行时凭证分离。必须测试连接池复用不会继承上一个用户的上下文。

迁移要覆盖：主键/外键、唯一索引、检索索引、pgvector 扩展、RLS 与角色授权。禁止把启用 RLS 与 policies 延后到上线前最后处理。

## 8. 内容连接器与采集任务

### 8.1 统一接口

所有连接器必须满足同一个契约，不能把平台原始响应直接传给排序服务：

```python
class Connector(Protocol):
    async def probe(self, context: ConnectorContext) -> CapabilityReport: ...
    async def discover(self, request: DiscoveryRequest) -> DiscoveryPage: ...
    async def fetch_updates(self, request: UpdateRequest) -> UpdatePage: ...
    async def refresh_item(self, request: RefreshRequest) -> NormalizedContent: ...
```

这些是接口规格，不是可直接运行的完整代码。实现时为所有 DTO 建立 Pydantic 模型，包括 deadline、分页大小、预算预留、策略版本、actor/scope、检查点和错误枚举。

`NormalizedContent` 至少包含：platform、external_id、canonical_url、creator_id、title、description、published_at、duration_seconds、language、media_type、retrieved_at、refresh_due_at、provenance、visibility_scope、owner_user_id、rights_policy_id。缺失时用 `null` 或明确的 `unknown`，不填猜测值。

按 `(platform, external_id)` 去重。跨平台使用规范化 URL 与内容指纹建立关联；同一个项目不同版本、不同演示和不同观点不能简单合并成一条。

采集结果、内容 upsert、下一阶段 outbox 与游标推进必须同事务提交。任何一步失败不得推进检查点。

### 8.2 YouTube

固定调用链：

```text
受预算约束的 search.list → 已知频道
channels.list → uploads playlist
playlistItems.list → 新视频 IDs
videos.list → 元数据补充
```

公共主题发现按领域分组、轮换查询、缓存和合并相同 query。不得逐用户、逐标签无限调用搜索。订阅导入走用户本地 OAuth 的只读路径，平台 token 不上传云端；仅同步用户同意导入的频道关系。

**配额必须先核验。** 原文中的“80 次搜索/8,000 普通单位”在代码中只作为内部预算配置候选，不能直接当成平台真实成本或配额规则。实现时记录官方配额说明、实际 Cloud 项目配额、每个 endpoint 的计费方式、重置时区和审核状态。任一信息不明确时，采用保守预算并阻止扩大流量。

默认调度：已关注频道每 60 分钟检查；公共发现按预算均匀分散；已缓存内容依来源规则刷新。任务不要在整点同时轰击全部频道，允许为负载平滑使用调度 jitter，不用于规避检测。

不以未经授权的字幕下载、媒体下载、隐藏播放器或非公开推荐接口作为 fallback。接口返回删除、不可用或授权撤销时，更新索引状态并按适用政策清理衍生表示。

### 8.3 Bluesky

使用 `app.bsky.feed.searchPosts` 作为初始发现接口，固定可信服务域并限制响应量。启动 probe 记录实际实例是否要求认证、分页和限流行为。

只保留视频相关条目：原生视频嵌入、外部视频链接及项目演示链接。区分“帖子本身”“媒体实体”“原始视频 URL”，避免多次转发形成多个相同候选。

保存 AT URI、CID、DID、创建时间及引用关系。搜索文本是用户偏好编译结果，不代表能够取得用户完整原生首页。401 标记授权要求；429 遵守退避；结构变更进入 adapter error，不伪造空 feed。

### 8.4 RSS

HTTPX 条件请求并保存 ETag / Last-Modified；feedparser 解析 Atom/RSS，使用明确 item ID 或规范化链接去重。

用户输入 URL 必须经过 SSRF 防护：仅 HTTP/HTTPS、拒绝 userinfo、限制端口、解析并检查全部 DNS 地址、拒绝私网/loopback/link-local/metadata 地址、每次重定向重新校验。实现与测试必须考虑 DNS rebinding；仅检查 URL 字符串或初次 DNS 结果不够。对不可信 URL 使用受限网络出口，阻止云 metadata 和内网访问。

默认连接超时 5 秒、总请求期限 20 秒、最多 3 次重定向、解压后响应体最多 5 MiB。XML 解析不允许外部实体或任意网络取数。超大文件与异常压缩响应拒绝处理。

只存允许的文本和链接。页面展示使用安全渲染，不将 feed 中 HTML 当作可信组件。

### 8.5 GitHub / Hacker News 辅助发现

GitHub 追踪已知公开 repo 的发布信息与视频链接，并遵守实际 rate-limit 响应。首次接入可只做公开 API，无需读取用户私人仓库。

HN 使用官方条目 API 的已支持列表，提取项目链接与视频链接。发现来源与原始发布来源分别保留，转载不算独立原创证据。

### 8.6 每个连接器的策略与失败行为

策略检查覆盖：`read_metadata`、`display_metadata`、`store_metadata`、`create_embedding`、`classify_content`、`process_media`、`share_representation`、`retain_until`。各动作分别判定，不因为允许展示元数据就推定允许所有衍生处理。

策略决策为 `allowed / denied / unresolved / expired`。只有 `allowed` 可以执行；其余状态返回明确原因。授权必须有来源、适用范围、审查者和期限。默认配置不能通过随便改一个布尔值绕过生产策略审核。

失败时保留上次成功时间与数据新鲜度，不把“连接器坏了”显示为“平台没有相关内容”。降级只发生在真实可用的路径，例如只展示允许显示的元数据；降级不能宣称具有字幕级或媒体级理解。

## 9. 内容分析、召回与排序

### 9.1 分析覆盖是第一等数据

每条分析结果记录：

```text
metadata_only
transcript_partial
transcript_full
media_sampled
media_full
```

同时记录 covered_segments、总时长是否已知、输入文本来源和策略版本。没有完整时长或缺少片段时不能标记 full。

字幕没有获取权限时，记录 `transcript_unavailable`；不是自动切到未经授权的抓字幕工具。授权媒体处理部署为 optional profile，不默认给全部 worker 安装大型媒体依赖或消耗 GPU。

### 9.2 Embedding

固定接口：`embed_queries(texts)` 与 `embed_passages(texts)`，输出 schema 标明 model_id、revision、dimension、normalized 和 input_hash。

初始模型采用 `intfloat/multilingual-e5-small`，维度目标 384；加载时根据模型元数据断言实际维度与数据库一致，模型变更必须迁移或另建表示版本。查询和内容前缀及最大输入长度按模型官方说明核实后固定。

使用模型 tokenizer 分块，目标每块约 400 tokens、重叠 48 tokens，计入前缀和特殊 token 的长度。向量归一化与余弦距离约定统一，不混用未经说明的点积和距离。

多个主要兴趣分别保存向量，按兴趣召回后合并，不能只把所有兴趣平均为一个向量。内容向量的复用受 scope 与 source policy 限制。

先用 pgvector 精确检索建立正确基线；数据量达到需要时增加 HNSW 索引，并把 ANN 对候选召回率的影响纳入测试。过滤发生在允许范围内，不能先跨所有租户检索再把私有结果隐藏掉。

### 9.3 结构化分类

初始模型 ID：`gpt-4.1-mini-2025-04-14`。启动时验证配置和账户能力；不要在每个请求失败后自动换到未知模型。

只传入经过策略允许的必要内容，排除 Cookie、token、个人浏览器页面和未经同意的私有信息。视频文本、评论或来源说明都视为不可信数据，不能覆盖系统指令。

输出 schema 必须 `additionalProperties: false`，至少包含：

```text
matched_tag_ids: 已知候选标签 ID 列表
content_format: demo | tutorial | news | discussion | other
technical_depth: beginner | intermediate | advanced | unknown
referenced_entities: 带原文依据的实体候选
features: 如是否出现代码仓库链接的可验证字段

evidence_spans:
  input_segment_id
  start_offset
  end_offset
  exact_quote

analysis_coverage: 由实际输入决定的枚举
```

`analysis_coverage` 的最终值由程序按输入元数据计算，不听任模型夸大。证据 quote 必须等于输入指定区间；无依据的 tag 拒收或降为待审候选，不伪造证据。

缓存键包括 normalized input hash、model ID/revision、prompt version、taxonomy version、rights policy version 和 visibility scope。不能让两个不同用户的私有材料通过公共缓存泄露分析结果。

超时、拒绝、解析失败、未知 tag、证据不匹配分开记录。只对可重试错误进行有限重试，默认最多 3 次指数退避并加入负载 jitter。预算用完时延后任务，不把未分析视为负面质量结论。

### 9.4 两阶段召回与确定性排序

顺序固定：权限/可见性与硬性过滤 → 标签/向量召回 → 合并最多 300 条候选 → 特征评分 → 内容去重 → 作者与探索配额 → 固化 feed session。

默认单批 20 条，核心兴趣 16 条、用户允许的相邻兴趣 4 条，同作者最多 2 条。用户探索设为 0 时不偷偷补探索内容；候选不足就显示更少并说明原因。

初始分数：

```text
score = 0.40 * semantic
      + 0.25 * tag_match
      + 0.15 * format_depth_match
      + 0.10 * novelty
      + 0.10 * freshness
```

所有特征取值映射到 [0,1]，记录映射版本。它是内部排序分，不是点击概率或喜欢概率。

- `semantic`：对用户各个允许兴趣向量的相似度分别计算，使用最高相关兴趣的匹配作为该项起点。
- `tag_match`：匹配显式喜欢与允许学习标签的加权覆盖；明确排除在评分前执行。
- `format_depth_match`：只使用有证据的内容形式和深度；未知不是“初级”。
- `novelty`：与用户明确已知/已消费内容及实体版本比较；agent 检查不算用户已知。
- `freshness`：初始采用发布后 7 天半衰期的衰减函数，可按内容类型配置；长期教程不因较旧直接硬排除。

缺失特征只在有合法、可用特征之间重新归一化权重，并显示覆盖不足；禁止补造特征。硬屏蔽来源保证不展示。硬屏蔽主题若无法确认是否命中，在用户启用 strict exclusion 时先隔离待分析，而不是承诺未知内容百分百符合要求。

稳定 tie-breaker 使用内容 ID。每个 feed session 固化 profile、taxonomy、ranking version 与候选截止时间，分页不边刷新边跳号。

### 9.5 反馈事件与学习规则

事件至少区分：`impression`、`user_open`、`user_save`、`user_consumed`、`explicit_positive`、`explicit_negative`、`agent_inspected`、`agent_action`。

显式负反馈原因：`irrelevant_topic`、`too_beginner`、`too_advanced`、`too_promotional`、`already_known`、`bad_source`、`format_disliked`。

初始学习只使用明确喜欢/不喜欢、收藏，以及用户确认消费的信号。打开和停留可保留用于诊断，但默认不自动改变兴趣；不存在用户在原平台全量浏览行为追踪。

学习偏好是可清空、可解释的派生状态。显示影响它的反馈依据，并允许用户一键重置学习偏好而保留显式选择。不要在第一版引入在线强化学习。

## 10. Web 产品页面与 UI 验收

### 10.1 Onboarding

先展示主要领域，选择后渐进显示子标签和关联领域。默认不要求用户看完整个标签库。提供种子模板，但任何模板选择都可编辑，不自动加入与用户目标无关的热门标签。

保存后展示偏好摘要，明确列出允许探索的范围和硬屏蔽条件。最多一次提交就能进入内容页；深度设置放进可展开区域。

### 10.2 聚合 Feed

卡片展示原来源、发布时间、可用时长、匹配理由、分析覆盖和相关实体链接。不用生成的标题替换原始标题后不做标注。

`Why this` 来自确定性评分和可验证分析，不调用模型现编推荐理由。用户能看懂“因为你选了本地推理，且这条内容演示了有仓库的推理工具”。

游标分页内部使用固定 session；默认批次有限，并提供明确结束状态。新内容到达显示“有更新”，由用户主动刷新，避免列表在阅读中重排。

反馈提交成功后局部更新；失败显示可重试状态，不假装已修改偏好。

### 10.3 Garden

必须并列显示三个状态：软件执行器是否正常、真实平台哪些动作可用、推荐效果是否已经验证。不能用一个绿色“Connected”掩盖后两项受阻。

显示绑定的稳定账号身份、设备、偏好版本、同意的动作与目标范围、运行预算、最后心跳、当前步骤、暂停按钮及原因码。所有模拟执行标记 `SIMULATOR`。

启动按钮只有在所需 capabilities 均允许时才可用；否则展示具体受阻动作与证据要求，不给一个可以点但最终只有摘要的假入口。

### 10.4 Connections / Privacy

产品登录、平台 API 授权和网页身份绑定分别呈现。撤销一项不得暗示另外两项自动撤销。

提供暂停所有设备、撤销某设备、断开某平台、导出偏好、删除产品数据。清楚说明这些操作不回滚平台已发生的账号行为或推荐历史。

### 10.5 前端质量

所有页面覆盖 loading、empty、error、stale、unauthorized、offline 状态。表单支持键盘与明确标签；视觉颜色不是唯一的权限或风险提示。中文/英文长度变化不破坏布局。

TanStack Query key 包含 user、profile_version、session_id 等必要上下文。退出登录清理私有缓存；禁止换号后短暂显示上一用户的 feed。

## 11. API 契约与认证

### 11.1 接口

| 方法与路径 | 主要输入 | 输出或行为 |
|---|---|---|
| `GET /v1/taxonomy` | locale、version | 已发布目录及 ETag |
| `PUT /v1/me/profile` | expected_version、profile | 新版本；冲突返回 409 |
| `GET /v1/me/profile` | 无 | 当前版本和显式/学习偏好摘要 |
| `GET /v1/feed` | cursor、limit≤20、profile_version | 固化 session 中的条目和 next_cursor |
| `POST /v1/feedback` | event_id、content_id、reason、source_session | 幂等接收用户反馈 |
| `POST /v1/devices/register` | device metadata | 受限设备注册结果 |
| `POST /v1/platform-bindings` | device、platform、identity evidence | pending/verified 绑定 |
| `POST /v1/consents` | binding、动作、目标范围、预算、有效期 | 不可变 consent revision |
| `POST /v1/runs` | binding、consent、profile_version、mode | 计划或明确 blocked 原因 |
| `GET /v1/runs/{id}` | 无 | 状态、进度、能力与阻塞 |
| `POST /v1/runs/{id}/claim` | device、expected_revision | 有限时效 lease 与 fencing token |
| `POST /v1/runs/{id}/pause` | reason | stop_requested；不谎称已撤销在途动作 |
| `POST /v1/actions/{id}/receipt` | receipt_id、typed result、evidence | 幂等确认与状态迁移 |
| `GET /v1/evaluations` | experiment/filter | 实测结果或 not_evaluated |
| `DELETE /v1/me/data` | 明确范围、重新认证 | 202 deletion_job_id，异步可追踪 |

以上接口必须生成 OpenAPI，不凭此表直接跳过模型定义。列表限制大小；JSON body 默认不超过 1 MiB，大媒体使用独立受控上传路径。

统一错误结构：

```json
{
  "error": {
    "code": "ACCOUNT_CHANGED",
    "message": "当前平台身份与绑定身份不一致，运行已暂停。",
    "retryable": false,
    "request_id": "server-generated-id"
  }
}
```

内部堆栈、密钥和平台完整响应不放在用户错误里。401/403/409/422/429/503 分开使用；权限受阻不返回 200 加假成功文案。

### 11.2 产品认证

使用 Supabase Auth PKCE。Web 与扩展各自按支持的 SDK 流程处理授权码；验证 issuer、audience、exp、签名、state 和回调目标。JWKS 轮换和缓存要测试，不能仅解码 JWT 就视为已认证。

扩展的产品登录通过 `chrome.identity.launchWebAuthFlow`，回调使用 `chrome.identity.getRedirectURL(...)` 生成的固定扩展回调。注册准确回调 allowlist，PKCE verifier 仅在扩展可信上下文保存；不把 refresh token 放在 URL、页面 DOM 或日志里。

具体 Supabase/Chrome 回调兼容性属于 M0 验证任务。必须做完整登录、取消、过期、state 错误、回调域错误和退出测试，不能凭浏览器弹出登录页就算认证完成。

### 11.3 平台 OAuth 和网页身份

YouTube API token 默认只保留在扩展可信上下文。只读导入使用 read-only scope；写动作按实际官方方法要求增量授权。scope 有效不意味着用户同意该批具体操作，两种检查都要通过。

OAuth 账号与 YouTube 当前网页频道分别核验，稳定 ID 优先于名称。无法通过支持、允许的方式取得稳定 ID 时设置 `IDENTITY_UNVERIFIED`，不回退到“名字看起来一样”。不得使用非公开接口逆向取身份。

用户切换频道、登出、重新绑定或撤销权限时，立即使现有计划失效。设备凭证只用于设备绑定，不替代用户认证或平台写授权；数据库存 hash，支持撤销与轮换。

### 11.4 扩展权限与消息安全

初始权限只申请必要的 `storage`、`identity`、`alarms`、`sidePanel`，并为平台域使用按需 host permissions。具体读 tabs 或脚本注入是否需要额外权限由实际代码决定，必须在 manifest review 说明，不默认申请 `<all_urls>` 或 `cookies`。

content script 没有 token 存取接口。background/side panel 的存储限制在可信上下文。页面到扩展的消息校验 schema、sender、tab、frame、origin、run_id、目标 action 和一次性上下文；网页脚本不能发送一条消息就让扩展替它请求任意 URL。

不启用不必要的 externally_connectable。生产 API/平台 host allowlist 编译时固定；模拟器 localhost 仅在开发构建启用。

## 12. 模式 B：本地原生 Feed 执行器

### 12.1 Capability Registry

每个平台适配器显式报告能力，不能因为存在某个方法名就认为可用于真实账号：

```text
import_subscriptions
verify_native_identity
observe_native_home
subscribe_approved_channel
submit_not_interested
open_selected_content
control_authorized_playback
verify_action_result
```

每项记录 `implementation_status`、`policy_status`、`auth_requirements`、`consent_requirements`、`verification_method`、`last_verified_at`、`evidence_refs`。

实现状态为 `not_implemented / simulator_only / implemented_unverified / live_verified`；策略状态独立为 `allowed / denied / unresolved / expired`。只有所需状态全部满足时，真实动作才进入计划。

初始默认：只读订阅导入按官方 OAuth 路径实现；用户确认的频道订阅按官方写接口验证；原生首页观察、页面反馈与播放控制全部单独核验。自动点赞、评论、清空历史不加入能力目录。

`control_authorized_playback` 不是允许隐藏或假观看。它需要独立确认平台规则、用户意图和浏览器行为；没有允许路径时保留阻塞状态。不得通过修改政策标志把未验证代码直接送入真实账号。

### 12.2 适配器接口

```typescript
interface PlatformAdapter {
  getCapabilities(): Promise<CapabilityReport>;
  verifyIdentity(expected: AccountBinding): Promise<IdentityResult>;
  observeHome(context: ObservationContext): Promise<ObservationResult>;
  inspectCandidate(target: CandidateRef): Promise<InspectionResult>;
  execute(action: ApprovedAction): Promise<ExecutionReceipt>;
  verify(action: ApprovedAction, receipt?: ExecutionReceipt): Promise<VerificationResult>;
}
```

接口中 `ApprovedAction` 必须是有限的 discriminated union，不接受任意脚本字符串、CSS selector 字符串或来自云端的函数体。YouTube 与 simulator 分别实现，业务状态机不掺杂平台 DOM。

页面选择器、可访问性匹配和结构检查放在版本化适配器中。匹配到零个或多个不确定目标时暂停，不以“最像的那个按钮”继续。页面导航后原元素引用失效，重新观察并核验上下文。

扩展包包含全部执行代码。配置可以描述允许范围和数据，不得变成远程代码、表达式解释器或可执行 DSL。

### 12.3 计划与用户同意

`RunPlan` 必须包括：run_id、binding、device、profile_version、consent_version、policy_version、candidate_snapshot_id、allowed_action_types、target_allowlist、action_budget、time_budget、expires_at、plan_hash。

用户同意必须对应具体目标清单，或明确可理解的有界目标规则。针对同一目标变化、动作类型变化、平台身份变化或预算扩大重新确认。初始官方订阅写流程仅允许用户预览并确认的频道清单。

A 产生的相关性分数不能直接变成写权限。模型觉得“用户大概会喜欢”不够，计划必须通过确定性策略检查。选择关联领域不自动授权订阅所有关联频道。

模拟器可默认每次最多 10 个动作、10 分钟；真实平台动作预算按完成核验后的策略设置，未核验时默认 0。不能将模拟器预算复制到生产即视为安全或允许。

### 12.4 状态机与持久化

正常状态：

```text
IDLE
→ VERIFY_ACCOUNT
→ OBSERVE
→ BUILD_PLAN
→ CHECK_PERMISSION
→ EXECUTE_ONE
→ VERIFY_RESULT
→ CHECKPOINT
→ OBSERVE / FINISHED
```

等待或异常：`NEEDS_LOGIN`、`IDENTITY_UNVERIFIED`、`ACCOUNT_CHANGED`、`WAITING_FOR_USER`、`POLICY_BLOCKED`、`DEVICE_OFFLINE`、`BUDGET_EXHAUSTED`、`UNCERTAIN_RESULT`、`PAUSED`、`FAILED`。

每次状态转移先校验 revision，在 IndexedDB 事务中保存，然后执行下一个有限步骤。网络或浏览器副作用不能放进假想的数据库原子事务里；必须把“准备执行”和“结果核验”拆开。

建议本地表：

```text
local_runs        run_id, revision, state, active_action_id, versions
local_actions     action_id, state, intended_target, precondition_hash
local_receipts    receipt_id, action_id, result, observed_at, sync_state
local_outbox      event_id, payload, attempts, next_attempt_at
local_bindings    binding_id, stable_account_id, last_verified_at
```

平台凭证不放入 content script 可读的表或消息里。运行恢复只依赖已持久化状态，不能依赖 service worker 全局变量。

### 12.5 单步执行顺序

每一个有账号副作用的动作都必须依序通过：

1. 取得有效 lease，确认 run 未请求暂停、预算未耗尽。
2. 确认当前设备、用户、平台账号和频道与绑定一致。
3. 确认 profile、consent、policy 的版本和有效期仍匹配。
4. 检查当前页面、目标、动作类型、目标范围和实际授权。
5. 在本地保存 `PREPARED` 与动作前状态；记录意图，不写成功。
6. 重新检查取消标记，然后将动作置为 `IN_FLIGHT` 并执行一次。
7. 核验结果，写入 `SUCCEEDED / NOOP_ALREADY_SATISFIED / FAILED / UNCERTAIN`。
8. 持久化 receipt，向云端幂等同步，再决定下一步。

`NOOP_ALREADY_SATISFIED` 必须有前置状态证据，例如目标频道已经订阅；不再次写入后再称为 no-op。

平台操作与本地事务之间没有天然原子性。在第 6 步崩溃时，恢复流程必须先核验目标状态，不能凭“数据库里没成功”重放。核验不出就暂停，并让用户决定下一步。

### 12.6 多设备、租约与暂停

同一个用户的同一个平台稳定身份默认只允许一个活跃写执行者，即使他在两个浏览器中登录。服务端 claim 事务串行化绑定占用，发出单调递增 fencing token；扩展在每次写前获取短期有效许可。

初始 lease 60 秒、心跳目标 20 秒。实际 MV3 唤醒与暂停行为必须测试，不能因为系统未按时唤醒就继续使用过期 lease。后台失去服务端连接时暂停新的账号写操作，允许本地保存回执；不依赖本地旧缓存授权继续写。

远程暂停标记 `stop_requested`；本地 side panel 暂停立即阻止新的动作。已经提交到平台的在途动作可能完成，必须记录真实结果，不能承诺撤回。

浏览器关闭时云端依据心跳标记 `DEVICE_OFFLINE`。重开后恢复观察与状态核验，不无条件继续旧写计划。过期 consent、未知账号身份或版本变化都要求重新确认。

### 12.7 提示注入与内容安全边界

视频说明、字幕、网页文本可能包含“忽略之前指令”等内容，它们始终是待分析数据。模型调用没有平台写工具，分类结果只允许返回 schema 内字段。

内容中的 URL 先规范化并按允许域和协议校验；不能让视频描述中的链接变成扩展的任意请求代理。动作目标必须由已经进入索引并经计划审核的 ID 引用。

拒绝收到的可执行 HTML/JS，不执行来源 iframe 中的指令，不开放通用 evaluate 接口。对日志和模型输入进行秘密与隐私字段剥离。

### 12.8 模拟器要求

建立自有站点，提供两个测试账号、首页推荐、视频详情、订阅与反馈状态，以及可见的模拟推荐算法。支持固定 random seed 和动作导致的可追踪推荐变化。

故障注入至少包括：登录失效、账号切换、页面按钮缺失、重复候选、写操作成功但响应丢失、动作提交前断网、提交后进程被杀、反馈弹窗变化、播放被阻止、lease 到期和重复任务投递。

模拟器只是验证执行器逻辑和测试工具。报告与 UI 必须写明 `simulator_only`，不得把模拟算法的改善用来证明 YouTube 推荐一定改善。

## 13. 后台任务、预算和成本控制

### 13.1 Celery 队列

`ingest` 负责网络采集；`analyze` 负责 embedding/classification；`maintenance` 负责趋势、刷新、清理、删除和 outbox 派发。仅运行一个受控 Beat 调度器，避免重复调度。

任务状态最终保存在 PostgreSQL。Redis 丢失时依 outbox 恢复未确认任务，不能把 Redis result backend 作为唯一业务事实。

默认任务定义：

```text
refresh_followed_sources       每60分钟，按源与预算分散
run_discovery_queries          由配额调度器分配
analyze_new_content            事件驱动
publish_feedback_updates      事件驱动，版本化且幂等
compute_tag_trends             每小时
discover_tag_candidates        每6小时
refresh_expiring_metadata      每小时检查到期项
sweep_revocations_and_deletes  每小时，撤销事件可即时触发
dispatch_outbox                持续小批量，不把密集 UI 轮询当队列
```

这些是项目内部任务计划，不是已经创建的 ChatGPT 自动任务。

### 13.2 配额预留

发起请求前按 provider/project/bucket/window 在数据库原子预留预计用量，请求完成后按实际结果结算。不依赖“上次看见还有配额”在多个 worker 中并发透支。

请求超时但可能已被平台计费时保守记账，待可验证信息出现再调整。429 尊重服务端重试信息，401/403 不做无意义自动重试，5xx 和网络错误有限重试。

API 费用与 LLM token 使用分开核算。美元价格表必须记录来源与核验时间，实际账单优先；原文没有提供可验证成本，不能编一个固定月费承诺。

默认在线推荐不等待新模型请求；优先读取预计算表示。内容量增加先检查重复分析和缓存命中，不直接堆更多 worker。

### 13.3 输入与资源限制

CPU embedding worker 默认低并发，避免每个进程重复加载模型导致内存耗尽。可选媒体 worker 单独设置并发、文件大小、时长、CPU/内存和超时预算。

FFmpeg 只处理落地到受限目录且验证过来源的文件；命令用参数数组，不拼接 shell 字符串。禁止输入路径逃逸和未经约束的网络协议。清理临时文件不能删除仓库、用户目录或与本任务无关的文件。

## 14. 数据保留、撤销与隐私

运行日志采用最小化策略：通常只保留 content ID、动作类型、时间、结果和版本；账号页面截图不默认上传。调试需要样本时取得明确同意、遮盖敏感信息，并设置短期过期。

第一版内部默认值：普通动作诊断日志 30 天、匿名化运行统计 90 天、显式偏好在账号存续期间保留、用户反馈最多 180 天后由用户决定是否继续保留。来源政策和用户请求要求更短期限时取更短值；这些是产品设计值，不是法律保留期限结论。

模型衍生数据、向量、Storage 对象和缓存必须能追溯到源数据与 owner。源被撤销或应删除时，删除任务沿依赖关系处理，不能仅从 UI 隐藏原视频。

`DELETE /v1/me/data` 先暂停运行和撤销设备，再删除或匿名化符合范围的数据，最后报告结果。共享公共内容只解除该用户的关系，不因一个用户删除账号破坏其他用户合法共享的记录。

用户可导出自己的 profile、显式/学习偏好、已知实体和反馈历史。导出不包含平台 token、Cookie、其他用户信息或无权再分发的媒体。

备份有明确的过期与删除处理说明；不能在产品页面承诺删除会瞬间抹除全部备份。生产错误上报启用字段过滤，测试一次 token、邮箱、账号页面内容不会进入 Sentry。

## 15. 开发与生产部署

### 15.1 本地运行

本地使用独立 Supabase 开发环境或受控本地实例，与生产彻底分离。Compose 启动 Redis、API、Web、worker 和 simulator；没有外部凭证时，使用明确标记的 fixtures/simulator 模式，仍可执行完整测试。

必须实现以下命令契约；在实现前不能把命令写成“已可用”：

```text
pnpm install --frozen-lockfile
uv sync --frozen
pnpm api:generate
pnpm taxonomy:validate
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm --filter extension build
uv run pytest
uv run ruff check .
uv run mypy services/backend
```

`pnpm dev` 负责清晰显示 Web、API、模拟器与扩展构建路径。端口从配置起点探测并在绑定冲突时有限重试，结果写入开发环境文件；不要假设 8000 总能使用，也不要自动杀掉用户其他进程。

Windows 入口 `.bat` / `.ps1` 使用 CRLF，避免不必要的 BOM 和含糊编码；工作目录固定到脚本所在仓库。保留用户的代理环境变量，不偷偷清空代理，不在运行时删除或重建整个仓库。

### 15.2 环境变量

`.env.example` 只包含占位值，不能出现真实秘密。至少列出：

```dotenv
APP_ENV=development
WEB_ORIGIN=http://localhost:3000
API_ORIGIN=http://localhost:8000
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379/0
SUPABASE_URL=https://...
SUPABASE_PUBLISHABLE_KEY=replace_me
SUPABASE_JWT_ISSUER=replace_me
SUPABASE_JWT_AUDIENCE=replace_me
OPENAI_API_KEY=replace_me
CLASSIFIER_MODEL=gpt-4.1-mini-2025-04-14
EMBEDDING_MODEL=intfloat/multilingual-e5-small
EMBEDDING_REVISION=pin_after_verification
YOUTUBE_PUBLIC_API_KEY=replace_me
YT_INTERNAL_SEARCH_REQUEST_BUDGET=80
YT_INTERNAL_GENERAL_UNIT_BUDGET=8000
CLASSIFICATION_DAILY_TOKEN_BUDGET=configure_before_enable
PLATFORM_MODE=simulator
POLICY_CONFIG_PATH=/app/config/source-policies.json
SENTRY_DSN=
```

原文配额内部值在完成 M0 核验前不得触发真实任务。平台 OAuth client ID 按扩展构建环境配置；应用私钥、数据库 owner/migration 凭证和服务端密钥不能使用 `NEXT_PUBLIC_` / `VITE_` 等客户端暴露前缀。

`PLATFORM_MODE=live` 不能单独开启真实操作；仍需 capability、policy、identity、consent、budget 全部通过。配置解析错误应启动失败，不默默回退到生产默认。

### 15.3 生产

初始目标采用原文的 GCP e2-standard-4 与 Supabase 托管数据层。具体 region、版本、资源限制和价格在部署前核验。它是开始压测的配置，不是吞吐承诺。

Docker Compose 服务包括 web、api、worker-ingest、worker-analyze、beat、redis、caddy；maintenance 可由受限 worker 队列消费。可选 media worker 用独立 profile，不默认占用基础实例。

只暴露 HTTP(S) 入口，Redis 和内部服务不开放公网。TLS 交给 Caddy；Next.js standalone 在容器内运行。API 设置明确 CORS allowlist，包括实际产品域和已发布扩展来源，不使用凭证请求配通配来源。

Secrets 从 GCP Secret Manager 注入。进程用非 root 用户；容器 healthcheck、资源限制、日志轮换和重启策略明确。数据库迁移由单次部署任务执行，不让每个 API worker 同时迁移。

发布流程：lint/typecheck → unit → integration → simulator E2E → build → migration dry-run → staging → smoke test → production。前后端接口兼容变更使用 expand/contract；rollback 不盲目执行会丢数据的迁移。

扩展先内部测试包，再处理商店隐私披露、权限审核与发布；生产包不包含模拟域、调试 token 或测试账号。

## 16. 测试矩阵与验收标准

### 16.1 功能与安全测试

| 测试组 | 必须覆盖的场景 | 通过条件 |
|---|---|---|
| Taxonomy | 循环、冲突别名、无效节点、目录回滚 | 不发布无效目录，旧偏好可解析 |
| Preferences | 乐观锁、软/硬偏好、显式与学习隔离 | 冲突返回409，学习不覆盖显式 |
| RLS | 两用户互读写、worker owner、池复用 | 所有越权测试失败且无私有数据泄漏 |
| Connector | 401/403/429/5xx、分页、删除、重复 | 明确状态，游标不丢数据，预算不透支 |
| SSRF | 内网、重定向、IPv6、metadata、DNS变化 | 所有不允许的网络目标被阻断 |
| Classification | 超时、拒绝、假证据、prompt injection | 不执行输入指令、不补造结论 |
| Ranking | 硬排除、未知特征、探索比例、作者上限 | 满足约束，稳定分页，可追溯评分 |
| Extension auth | 错误state、取消、过期、频道切换 | 不发起错误身份写操作 |
| Action recovery | 提交前/后崩溃、回执丢失、重复投递 | 先核验，不盲目重复写 |
| Cancellation | 本地暂停、远程暂停、lease过期 | 不再开始新动作，正确报告在途结果 |
| Multi-device | 两设备同时claim、旧fencing token | 单一有效写执行者 |
| Privacy | logout缓存、导出、删除、日志脱敏 | 不显示上个账号数据，不暴露秘密 |

模拟器中关键写操作安全测试必须全部通过，不能用总体覆盖率掩盖未测的账号切换分支。真实平台行为仍需单独核验。

### 16.2 聚合推荐评测

初始构建至少 300 条有权用于评测的视频/视频帖样本，覆盖不同领域、作者和内容深度。建立至少 10 个测试偏好 profile；这是实验材料目标，不代表真实用户数量。

按作者/频道分组切分调参与保留测试集，避免同源风格泄漏。对比关键词基线、标签规则基线和完整排序。标注者评价“值得看”“明确不符合”“已知/重复”和分析覆盖，不由同一个生成模型自行给自己打分。

初始验收目标：前 20 条人工相关比例 ≥80%；硬屏蔽来源违规为 0；有依据的推荐理由覆盖全部展示条目；预算和候选不足时如实显示少于 20 条。这些不是已达成结果。

同时报告 coverage、来源分布、探索内容接受率和单条内容平均分析开销，不能只展示一个平均分。

### 16.3 原生 Feed 效果评测

必须先满足平台允许路径、实验参与者同意、必要的隐私保护，以及可重复的样本采集方式。未满足时状态为 `NOT_EVALUATED_PLATFORM_BLOCKED`。

初始实验协议采用同期处理/对照设计，优先按参与者或账号随机分配；可以预设 3 天基线、7 天干预、3 天停用观察作为试验流程，但样本量和窗口应由实际变异、招募和允许条件确定，不能据此宣称统计功效足够。

不使用同一账号快速来回切换的简单 A/B 作为唯一证据，因为历史影响可能残留。记录用户在实验外的使用变化、平台变更和采样时间偏差。

原生首页样本采集时禁用我们的显示重排/隐藏。主指标是目标相关比例的变化；同时观察分心内容比例、作者多样性、已知重复率、停用后保留效果和用户主观满意度。

分析以账号/参与者作为聚类单位；同一人的多个视频不能当成彼此独立的用户样本。报告样本量、缺失数据、区间和不确定性。控制不足时只能报告观察关联，不能声称已证明因果。

### 16.4 性能与成本验收

压测前先声明数据量、机器、并发用户和 warm/cold 条件。初始目标：缓存 feed API 在 10 个并发测试会话下 P95 <1 秒；这个值需要测，不是服务器配置天然保证。

LLM 分析不在在线 feed 请求的关键路径上。预算耗尽后不再新增模型请求；采集限流后继续返回合规缓存并标注新鲜度。记录 p50/p95 延迟、错误率、队列滞后、模型缓存命中与内存峰值。

没有真实账单与完整负载时不发布“每用户每月成本”结论。

## 17. 实施里程碑与交付顺序

### M0 — 外部能力核验与最小闭环

交付 `docs/capability-matrix.md`、`docs/verification-log.md`、依赖锁、项目骨架与 simulator healthcheck。

核验：YouTube API 实际配额与端点行为、订阅读写的官方授权、网页身份可核验性、首页观察/反馈/播放允许路径、Supabase 扩展 PKCE、所选模型与 Embedding revision。每一项记录官方来源、核验时间、真实调用结果或明确未调用状态。

通过标准：真实能力与未解阻塞分开；没有把原文观点当成授权。若 B 真实平台受阻，继续实施可验证的模拟器、A 与数据层，但保留真实平台 BLOCKED 状态，不自称项目目标已完成。

### M1 — 本地执行器先跑通

实现扩展 background/content/sidepanel、Dexie 状态机、账号核验契约、有限动作计划、暂停、lease、回执、故障恢复和 simulator adapter。

通过标准：账号切换、回执丢失、进程终止、重复任务、多设备和暂停测试全部通过。没有通用 LLM 点击器和远程执行代码。

### M2 — 偏好底座与产品账号

实现 taxonomy seeds/validator、Supabase 产品登录、profile API、版本与 RLS、onboarding、偏好反馈基础模型。

通过标准：同一份版本化 profile 被 A 排序与 B 计划引用；显式/学习分开；租户隔离测试通过。用户可编辑关联领域而不是被动接受扩散。

### M3 — 聚合采集与内容库

按 YouTube、RSS、Bluesky 的实际可用条件接入，GitHub/HN 作为辅助。实现来源政策、检查点、预算、outbox、去重、刷新和删除；没有凭证时使用标记清晰的测试连接器。

通过标准：至少两个真实允许来源完成从采集到显示的闭环，其余来源如实显示进度。不得用 fixtures 冒充实时采集。

### M4 — 语义理解与聚合体验

实现 embedding、结构化分析、coverage、确定性排序、有限 feed、理由与分原因反馈，以及趋势候选更新。

通过标准：固定评测报告比较基线；若未达到目标，交付失败分析和实际成绩，不擅自降低指标再宣布通过。

### M5 — 获准的真实账号执行

仅启用 M0 已落实允许路径且通过测试的动作。先小范围验证身份、同意、动作结果和暂停；不因技术上能点击就上线。

通过标准：关键动作真实核验通过，策略与权限可撤销。若只验证订阅，状态写“真实订阅动作已验证”，不写“自动刷视频已实现”。

### M6 — 原生效果、部署与交付

完成授权实验、性能测试、staging 部署、隐私与商店材料、运维说明和完整 release-status。

通过标准：A 是否可用、B 哪些能力真实可用、B 改善是否已验证均有独立证据。没有原生改善证据时不宣布完整产品成功。

## 18. 给开发 Agent 的工作与最终交付要求

从 M0/M1 开始，不要先花大部分时间做营销页、庞大标签目录或重构为通用 agent 平台。先打穿不可替代的执行器和账号安全，再扩展信息质量。

每完成一个里程碑提交：变更文件、运行过的命令、真实测试结果、未通过项目、平台阻塞和下一步。不能把“写了测试”视为“测试通过”，不能伪造截图、演示数据或用户研究。

必须交付完整仓库而不只是路线图，包括已实现代码、锁文件、数据库迁移、种子数据、测试、启动脚本、`.env.example`、API 契约和 README。真实能力缺失时用明确的 `UnsupportedCapability` / `POLICY_BLOCKED` 返回，不用 TODO 假成功接口。

`docs/release-status.md` 每一项使用下面的状态之一：

```text
NOT_STARTED
IMPLEMENTED_UNTESTED
TESTED_SIMULATOR
VERIFIED_LIVE
BLOCKED_EXTERNAL
FAILED_ACCEPTANCE
```

最终至少分别报告：产品登录、偏好设置、YouTube 公共采集、RSS、Bluesky、模型分析、聚合评测、扩展账号核验、模拟器恢复、真实订阅动作、原生观察、原生反馈、允许的播放能力、原生改善评测、部署。

涉及外部服务或权限阻塞时，不把问题隐藏在 README 最后。提供已经实现的部分、准确原因和缺少的条件；继续完成不依赖该阻塞的工作。禁止通过转用未公开 API 或绕过限制“补齐完成度”。

不要重新要求产品提出者解释本文件已经明确的两种模式或技术路线。一般工程细节依据本规格做决定；确实影响权限、花费或不可逆账号行为的选择必须保持未授权状态，不能自行扩权。

## 19. 实现前需要复核的官方入口

以下链接用于开发 agent 自行核验外部依赖，来源沿用原文或对应官方文档入口。本次文件编写没有重新进行实时接口测试或平台审核；列出链接不代表相关能力已获得授权。

- WXT 入口组织：https://wxt.dev/guide/essentials/entrypoints.html
- YouTube 配额：https://developers.google.com/youtube/v3/determine_quota_cost
- YouTube 订阅读取：https://developers.google.com/youtube/v3/docs/subscriptions/list
- YouTube 订阅写入：https://developers.google.com/youtube/v3/docs/subscriptions/insert
- YouTube 字幕下载：https://developers.google.com/youtube/v3/docs/captions/download
- YouTube 开发者政策：https://developers.google.com/youtube/terms/developer-policies
- YouTube 服务条款：https://www.youtube.com/static?template=terms
- YouTube 推荐说明：https://support.google.com/youtube/answer/16089387
- Bluesky 搜索 lexicon：https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/searchPosts.json
- GitHub API 限流：https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- Embedding 模型说明：https://huggingface.co/intfloat/multilingual-e5-small
- OpenAI 模型目录：https://platform.openai.com/docs/models/gpt-4.1-mini
- OpenAI Structured Outputs：https://platform.openai.com/docs/guides/structured-outputs
- Supabase PKCE：https://supabase.com/docs/guides/auth/sessions/pkce-flow
- Supabase RLS：https://supabase.com/docs/guides/database/postgres/row-level-security
- Chrome identity：https://developer.chrome.com/docs/extensions/reference/api/identity
- Chrome worker 生命周期：https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome 远程代码限制：https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- 浏览器自动播放：https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- Celery 任务语义：https://docs.celeryq.dev/en/stable/userguide/tasks.html
- Next.js 自托管：https://nextjs.org/docs/app/guides/self-hosting
- Playwright 扩展测试：https://playwright.dev/docs/chrome-extensions
- GCP 实例类型：https://cloud.google.com/compute/docs/general-purpose-machines

## 20. 终局判断

本项目不是“让模型看几个标题再输出摘要”。它的产品资产是用户能理解和修改的偏好、可追溯的信息状态、可靠的本地执行和经过验证的推荐改善。

工程交付必须围绕这句话验收：

> 用户不打开我们的过滤界面，直接回到原平台，也能在经过允许且可控的调校后得到更符合主动目标的推荐。

这是待证明的目标，不是本文已经证明的事实。A 的质量、B 的执行能力与 B 的实际效果，始终分别报告。
