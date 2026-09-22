**明确答案：这款产品按「Web 控制台＋Chrome 扩展＋Python 后端＋共享内容索引」落地。聚合模式在云端运行，养 feed 模式在用户本地浏览器运行，两者共用同一份偏好数据。**

我把第一版固定为：**桌面 Chrome、中英双语、先覆盖开发／AI／开源领域；聚合接入 YouTube、Bluesky 视频帖和作者 RSS；原生 feed 调校先做 YouTube 适配。** 标签结构不限制领域，后续扩展不需要重写系统。

以下是工程规格。模型权重、采集频率和验收阈值属于初始设计，不是已经测出的效果。

## 一、技术栈直接定下来

| 模块 | 固定选型 | 在本项目中的具体职责 |
|---|---|---|
| Web 前端 | **Next.js＋React＋TypeScript** | 兴趣设置、聚合 feed、账号连接、任务与效果报告 |
| UI 与表单 | **Tailwind CSS＋shadcn/ui＋React Hook Form＋Zod** | 标签选择器、偏好编辑器、权限确认、输入校验 |
| 前端数据状态 | **TanStack Query** | 获取 feed、缓存、分页、反馈后的局部刷新 |
| Chrome 扩展 | **WXT＋React＋TypeScript，Manifest V3** | 在用户浏览器内识别页面、执行获准动作、展示运行状态 |
| 后端 API | **Python＋FastAPI＋Pydantic** | 偏好管理、内容查询、推荐计算、任务管理 |
| 数据库访问 | **SQLAlchemy 2＋psycopg 3＋Alembic** | 查询、事务、数据库迁移 |
| 主数据库 | **Supabase 托管 PostgreSQL＋pgvector** | 用户数据、标签关系、内容、向量、任务记录 |
| 产品账号认证 | **Supabase Auth，PKCE 流程** | 登录我们自己的产品，不与社交平台登录混为一谈 |
| 采集程序 | **HTTPX＋feedparser＋各平台官方 API** | 获取允许接入的公开内容与更新 |
| 后台任务 | **Celery＋Redis＋Celery Beat** | 定时采集、标签更新、内容分析、失败重试 |
| 语义向量 | **multilingual-e5-small，通过 sentence-transformers 部署** | 中文偏好与英文内容之间的语义匹配 |
| 结构化内容分析 | **GPT-4.1 mini 固定快照＋Structured Outputs** | 提取领域标签、内容形式、技术深度、相关证据 |
| 本地执行状态 | **IndexedDB，使用 Dexie 封装** | 浏览器任务断点、动作记录、待同步事件 |
| 文件存储 | **Supabase Storage 私有桶** | 经过授权的字幕、分析材料、用户主动上传的文件 |
| 测试 | **pytest＋Vitest＋Playwright** | 后端、规则、扩展、端到端流程测试 |
| 部署 | **Docker Compose＋GCP Compute Engine＋Caddy** | 运行 API、Web、worker、调度器和反向代理 |

WXT 本身提供扩展入口组织方式；FastAPI 可以生成 OpenAPI 接口规范；pgvector 支持直接在 PostgreSQL 中进行向量检索，因此第一版没有必要再引入独立向量数据库。([wxt.dev](https://wxt.dev/guide/essentials/entrypoints.html))

**暂时不用 LangChain、CrewAI、Kubernetes、Kafka、Neo4j，也不做 Electron 桌面壳。** 这是本项目的范围控制：先把两个实际功能做通，而不是先搭一套通用 agent 平台。

---

## 二、整体数据流：两个模式究竟怎么连接

```text
用户选择领域、标签、关联领域、内容偏好
                    ↓
           Preference Profile
                    ↓
       ┌────────────┴────────────┐
       ↓                         ↓
聚合模式 A                  原生调校模式 B
云端发现内容                本地浏览器执行
       ↓                         ↓
去重、打标签、排序           观察 → 计划 → 获准动作
       ↓                         ↓
我们的聚合 feed             平台账号发生真实变化
       └────────────┬────────────┘
                    ↓
         用户反馈与效果评估
                    ↓
       更新偏好，但区分反馈来源
```

这里必须坚持一个数据原则：

**“软件看过”“用户看过”“用户喜欢”是三种不同事件，不能混在一起。** 否则软件自己选了一批内容，再把自己的操作当成用户喜欢的证据，会形成错误的自我强化。

## 三、前端具体做哪些页面，怎么实现

第一版只做四个主要页面。

**`/onboarding`：兴趣初始化。**  
用户先选领域，然后出现该领域的子标签和关联领域。标签不是自由生成，而是从后端发布的目录中选择。用户可以进一步指定内容偏好，例如“实际演示”“有源代码”“不要入门教程”“少看新闻复述”。

组件直接拆成 `DomainPicker`、`TagPicker`、`RelatedDomainPicker`、`ContentPreferenceForm`。表单用 React Hook Form，Zod 校验，提交时生成一份完整的 `PreferenceProfile`。

**`/feed`：聚合模式。**  
显示视频卡片、来源、匹配原因、内容分析覆盖范围。使用游标分页，不用“第几页”偏移分页。反馈按钮必须区分“主题不相关”“太基础”“广告太多”“已经知道”，不能只有一个笼统的 dislike。

**`/garden`：养 feed 控制台。**  
显示绑定的浏览器与平台账号、当前偏好版本、允许的操作、待执行任务、执行记录和暂停按钮。这个页面不假装自己就是 YouTube 首页。

**`/settings/connections`：授权管理。**  
分别管理产品登录、平台 API 授权、浏览器连接，以及删除产品数据。断开我们产品的连接，不等于替用户退出 YouTube 或删除 YouTube 历史。

偏好每次保存都增加 `profile_version`。TanStack Query 的 feed 缓存键包含这个版本；正在运行的浏览器任务发现版本变化后暂停，避免继续按照旧偏好操作。

## 四、标签大列表如何存储、维护和自动更新

### 4.1 基础标签不是写死在前端，而是版本化的数据文件

源文件放在：

```text
data/taxonomy/domains.yaml
data/taxonomy/tags.yaml
data/taxonomy/relations.yaml
```

例如：

```yaml
id: topic.local_inference
label:
  zh: 本地推理
  en: Local inference

parent_ids:
  - domain.ai_infrastructure

aliases:
  - 本地模型推理
  - local LLM inference

related:
  - id: topic.model_quantization
    weight: 0.8
  - id: topic.webgpu
    weight: 0.5

status: active
```

`id` 一旦发布就不改。显示名称可以变；同义词可以增加；废弃标签保留迁移关系，而不是直接删除。

数据库拆成 `tags`、`tag_aliases`、`tag_edges`、`taxonomy_versions`。父子关系与关联关系分开存，允许一个标签属于多个领域；发布时检查父子关系是否出现循环。

用户偏好不保存在标签表里，单独存：

```text
user_id
tag_id
preference: like / dislike / neutral
strength: 0—1
origin: explicit / learned
updated_at
```

**用户明确选择的偏好与模型学到的偏好分开，模型不能覆盖用户明确设置。**

### 4.2 自动更新分成两个任务

**任务一：发现新标签候选，每六小时运行。**

从允许分析的新增内容中提取项目名、框架名和新概念。已有别名直接归并；未知实体进入 `tag_candidates`，必须保留来源、首次出现时间和关联领域。

初始晋级条件可以设为：七天内至少出现于五条去重内容、三个独立发布者，并有可确认的项目或概念实体。达到条件后进入管理页审核。

脚本可以自动创建临时实体，但**不能未经审核就把一个流行词加入所有用户的兴趣树**。

**任务二：计算趋势，每小时运行。**

对于已有标签，统计过去 24 小时在已接入内容中的去重提及占比，与之前七天的日均占比比较，再加入来源多样性约束。

输出存到：

```text
tag_trend_snapshots
  tag_id
  domain_id
  window_start
  window_end
  trend_score
  independent_publishers
  sample_size
```

你说的 `xx-trending in xx`，实现为一条动态查询：

> 在用户选择的领域里，返回当前趋势分数较高、样本量足够的标签及相关内容。

它不是不断制造新的永久标签。界面也必须写“在已接入来源中升温”，不能把有限样本包装成全网热度。

## 五、聚合模式 A：每个平台怎么拿到内容

### 5.1 YouTube：官方 API，发现与频道追踪分开

采集文件放在 `connectors/youtube.py`。

**发现新内容**使用 `search.list`，把用户领域和标签编译成有限数量的搜索主题。搜索结果在允许共享的公共内容层复用，不为每个用户重复搜一次。

**追踪已知频道**使用这条链路：

```text
channels.list
  → 获取频道的 uploads playlist
playlistItems.list
  → 获取上传列表
videos.list
  → 补充视频元数据
```

用户导入订阅时调用 `subscriptions.list(mine=true)`，订阅关系属于该用户的私有数据；公共频道信息可以复用，但“谁订阅了谁”不能共享。([developers.google.com](https://developers.google.com/youtube/v3/docs/subscriptions/list))

这里有一个必须按最新文档修正的点：**YouTube 当前官方文档将搜索列为独立配额桶，默认每天 100 次 `search.list`，其他端点合计默认每天 10,000 单位。** 不能继续照旧教程把搜索硬写成每次消耗普通桶的 100 单位，最终还要核对实际项目控制台。([developers.google.com](https://developers.google.com/youtube/v3/determine_quota_cost))

第一版的内部预算固定为：

```text
搜索：每天最多 80 次，留出余量
普通读取：每天最多 8,000 单位
发现主题：轮换调度，不逐个标签无限搜索
```

遇到配额不足就暂停该来源的新发现，继续展示已有合法缓存；不通过换账号或换 API 项目绕配额。

### 5.2 Bluesky：抓帖子中的视频，而不是假设有完整个人首页 API

采集文件为 `connectors/bluesky.py`。

使用 `app.bsky.feed.searchPosts` 搜索主题，处理帖子中的原生视频嵌入和外部视频链接。记录帖子 URI、版本 CID、作者、发布时间、链接与媒体类型。

官方接口定义明确指出，某些服务提供者可能要求认证，所以连接器启动时要做能力检查：返回 401 就标记“需要授权”，不能默认任何 AppView 都能匿名无限读取。([github.com](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/searchPosts.json))

### 5.3 作者 RSS：用于稳定追踪与补充内容信息

采集文件为 `connectors/rss.py`。

用 HTTPX 获取 feed、feedparser 解析；保存 `ETag` 和 `Last-Modified`，下次进行条件请求。视频 enclosure、视频原链接、作者自己的介绍都统一转为内容记录。

用户添加 RSS URL 时必须防止服务端访问内网：限制协议、响应体大小、重定向次数，拒绝私有 IP 和本地地址。正文按文本处理，不执行来源 HTML。

### 5.4 GitHub 与 Hacker News：只做发现辅助

它们用于发现新项目、发布记录和项目演示链接，不冒充视频平台。

GitHub 连接器遵守实际响应的限流信息；HN 从官方 API 的新帖等列表读取条目。一个 HN 帖子和一个 YouTube 视频指向同一项目时，可以建立实体关联，但不能直接视为内容完全相同。([docs.github.com](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api))

**第一版不承诺接入 X、Instagram、TikTok、Reddit 的个人推荐流。** 没有落实数据访问路径的平台，不在 UI 里放一个实际上不能工作的“连接”按钮。

### 5.5 所有连接器必须经过同一个“数据使用权限”检查

统一内容结构至少包括：

```text
platform / external_id / canonical_url
title / description / creator_id / published_at
content_type / language / duration
retrieved_at / refresh_due_at
provenance / rights_policy_id
```

`source_policies` 再区分：是否允许展示元数据、生成向量、衍生标签、处理媒体，以及保留期限。

这一层不能省。YouTube 的基础政策限制 API 衍生数据，但其附加政策已经列出有条件的内容分类与标签许可路径；**这不是“全部不能做”，也不是“拿到 API key 就全部能做”，需要确认本项目适用的审核与许可条件。** 未确认前，相关分析功能保持关闭。([developers.google.com](https://developers.google.com/youtube/terms/developer-policies))

## 六、内容理解与推荐：具体用什么模型、怎么调用

### 6.1 语义检索用小模型，不让大模型读全部候选

选择 **`intfloat/multilingual-e5-small`**。它输出 384 维向量，输入上限为 512 tokens，模型说明要求检索查询与内容分别使用 `query:`、`passage:` 前缀。([huggingface.co](https://huggingface.co/intfloat/multilingual-e5-small/raw/main/README.md))

实现为 `services/embedding.py`：

```text
用户某个兴趣方向 → query: 兴趣描述
允许分析的内容片段 → passage: 标题和内容描述
                    ↓
               384 维向量
                    ↓
          PostgreSQL vector(384)
```

长文本按约 400 tokens 分块并留重叠，不直接截断整篇文章后声称理解了全文。

同一条内容只生成一次可共享的向量。用户不同的是查询向量和排序结果。

用户同时喜欢机器人和游戏设计时，保存两个兴趣方向的向量，**不把所有兴趣平均成一个失去区分度的向量**。

### 6.2 结构化分析用固定模型快照

选择 **`gpt-4.1-mini-2025-04-14`**，通过官方 Python SDK 调用 Structured Outputs。该快照仍列在官方模型目录中，并支持结构化输出。([platform.openai.com](https://platform.openai.com/docs/models/gpt-4.1-mini))

模型只输出固定字段：

```text
matched_tag_ids
content_format: demo / tutorial / news / discussion / other
technical_depth: beginner / intermediate / advanced / unknown
referenced_entities
evidence_spans
analysis_coverage
```

标签 ID 必须来自我们传入的候选标签，不接受模型凭空创造正式标签。证据必须对应实际输入文本中的片段。

缓存键固定为：

```text
内容哈希 + 模型快照 + prompt版本 + taxonomy版本
```

同一结果可复用，不因为 100 个用户看到它就调用 100 次模型。请求失败、拒绝、输出不完整都进入明确的错误分支，不能把空结果理解成“不相关”。Structured Outputs 也仍需要处理拒绝与不完整响应。([platform.openai.com](https://platform.openai.com/docs/guides/structured-outputs))

### 6.3 视频分析不能假设字幕随便拿

YouTube 官方字幕下载接口要求调用用户具有编辑该视频的权限，因此不能把“给任意视频 URL 自动拿字幕”当成已解决的基础能力。([developers.google.com](https://developers.google.com/youtube/v3/docs/captions/download))

第一版明确区分：

**元数据分析**：只知道标题和介绍。  
**字幕分析**：有允许处理的字幕。  
**媒体分析**：有允许处理的视频或音频。

有媒体处理权限时，才启用 `FFmpeg＋faster-whisper` 分支：转写音频、抽取关键帧，再让支持图像输入的模型辅助判断。faster-whisper 提供基于 CTranslate2 的 Whisper 推理实现；GPT-4.1 mini 可以接收图片，但不是直接接收完整视频和音频的模型。([github.com](https://github.com/SYSTRAN/faster-whisper))

**只分析了标题，就标记“根据标题和介绍匹配”；抽样看了片段，就标记抽样范围。不能统一写成“AI 已看完”。**

### 6.4 第一版排序直接写确定性代码

文件为 `services/ranking.py`，不用强化学习。

流程固定为：

```text
硬性排除
  → 标签召回与向量召回
  → 最多 300 条候选
  → 结构化特征与个人偏好打分
  → 去重与来源多样性处理
  → 返回 20 条
```

初始排序权重可以固定为：语义匹配 40%、标签匹配 25%、内容形式与深度匹配 15%、相对用户历史的新颖性 10%、时效性 10%。这些权重需要实验调整，分数不能冒充“用户喜欢的概率”。

20 条里默认 16 条来自主要兴趣，4 条来自用户明确允许的关联领域。同一作者最多占两条；同一项目的新版本不因为项目名相同就被去掉。

负反馈按原因更新：  
“太基础”调整深度偏好；“已经知道”更新已知实体；“主题不相关”才调整主题匹配。浏览器执行器产生的行为不参与用户喜好学习。

## 七、登录与账号绑定：三个身份分开处理

**产品账号**用 Supabase Auth。Web 使用 PKCE 登录；扩展通过 `chrome.identity.launchWebAuthFlow` 完成产品认证，再交换授权码。FastAPI 校验 JWT 签名、签发方、过期时间与用户身份。Supabase 提供 PKCE 与 JWT 签名密钥机制。([supabase.com](https://supabase.com/docs/guides/auth/sessions/pkce-flow))

**YouTube API 授权**在用户点击“导入订阅”时单独申请。Chrome 扩展使用 `chrome.identity.getAuthToken`，先只请求 `youtube.readonly`。这个 API 可以管理访问令牌缓存；需要进一步授权时，由明确的用户操作触发。([developer.chrome.com](https://developer.chrome.com/docs/extensions/reference/api/identity))

**YouTube 网页登录态**则继续由用户自己的浏览器管理。我们不索取密码，不导出 Cookie，不把完整浏览器会话上传到服务器。

还要处理一个容易漏掉的情况：**Chrome 登录的 Google 账号、OAuth 授权账号、YouTube 当前选中的频道可能不同。** 绑定时和执行前都必须核验目标身份；无法可靠核验就暂停，不根据显示名称猜测。

第一版让平台令牌留在本地执行环境，云端只接收用户允许同步的订阅关系等结果。扩展的认证存储限制在可信扩展上下文，不暴露给内容脚本。

## 八、原生养 feed 模式 B：真正的执行器怎么写

这是产品最关键的一部分。

### 8.1 扩展拆成四层

```text
entrypoints/background.ts
  任务唤醒、状态恢复、与后端同步

entrypoints/youtube.content.ts
  页面观察与获准的页面动作

entrypoints/sidepanel/
  显示账号、运行状态、候选动作、暂停按钮

src/adapters/youtube/
  YouTube 页面与操作的具体适配
```

**Playwright 不作为云端生产执行器登录用户账号。** 它主要负责测试扩展和执行流程。生产执行发生在用户真实的本地浏览器里。

### 8.2 不写一个永久运行的 while 循环

Manifest V3 的 service worker 会被终止，内存变量不能作为长期任务状态。Chrome 官方要求考虑意外终止并持久化数据；alarms 也不会唤醒休眠中的设备。([developer.chrome.com](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle))

因此采用：

```text
chrome.alarms / 页面事件唤醒
  → 从 IndexedDB 读取任务
  → 执行一个有限步骤
  → 写入状态
  → 等待下一次事件
```

浏览器关闭时状态为 `DEVICE_OFFLINE`。重新打开后恢复或重新确认，不声称电脑关机了仍能在本地继续养号。

### 8.3 执行逻辑用状态机，不让 LLM 自由控制鼠标

状态固定为：

```text
IDLE
→ VERIFY_ACCOUNT
→ OBSERVE
→ BUILD_PLAN
→ CHECK_PERMISSION
→ EXECUTE_ONE
→ VERIFY_RESULT
→ CHECKPOINT
→ 下一步 / FINISHED
```

异常状态包括：

```text
NEEDS_LOGIN
ACCOUNT_CHANGED
WAITING_FOR_USER
POLICY_BLOCKED
UNCERTAIN_RESULT
PAUSED
```

模型负责判断内容与偏好是否相关；确定性代码负责决定哪些动作可执行；平台适配器负责实际执行和核验。

模型不能返回任意 JavaScript、任意选择器或任意访问地址。扩展也不从服务器下载执行代码，适配器随扩展版本发布；Chrome 对远程托管执行代码有明确限制。([developer.chrome.com](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code))

### 8.4 动作必须分清“现在有路径”和“仍需许可”

| 动作 | 实现路径 | 第一版状态 |
|---|---|---|
| 导入订阅 | 官方 API，用户只读授权 | 可实现 |
| 订阅用户确认的频道清单 | 官方 `subscriptions.insert`，另行请求写权限 | 可实现，但需要具体同意 |
| 阅读原生首页推荐 | 本地页面适配器 | 受平台条款与许可限制 |
| 提交“不感兴趣”等反馈 | 本地页面适配器 | 不假设存在公开官方写接口；需单独落实许可 |
| 自动播放、连续观看来影响历史 | 页面／播放器执行链 | 高风险功能，默认不上线 |
| 自动点赞、评论、清空历史 | 写接口或页面动作 | 第一版不实现 |

YouTube 官方确实提供订阅写接口，但它需要相应的写授权，不能用 `youtube.readonly` 完成。([developers.google.com](https://developers.google.com/youtube/v3/docs/subscriptions/insert))

另一方面，YouTube 对自动化访问、抓取、人工增加互动以及后台播放器有约束。**本地执行和用户登录都不会自动消除这些约束，配置里写一个 `enabled=true` 更不等于获得许可。**([youtube.com](https://www.youtube.com/static?template=terms))

所以研发环境里可以先用自建的模拟 feed 验证完整状态机；真实平台的自动反馈和播放分支，必须在落实允许路径后启用。

**只完成自动订阅，不等于完成你提出的“自动刷原生 feed”。这个不能在验收时偷换。**

### 8.5 每个动作都要有执行凭证

`actions` 表记录：

```text
action_id
run_id
user_id
platform_account_binding_id
action_type
target_id
profile_version
consent_version
policy_version
expires_at
status
```

执行前检查账号、偏好版本、授权范围与有效期。执行后记录动作前状态、动作后状态和核验结果。

最重要的恢复规则是：**如果动作可能已经生效但回执丢了，先核验，不盲目重做。** 无法判断就进入 `UNCERTAIN_RESULT`，避免重复点击、反复订阅或反向切换状态。

播放器拒绝自动播放时进入 `WAITING_FOR_USER`，不把浏览器允许自动播放当作必然条件。浏览器确实可能因自动播放限制而拒绝播放请求。([developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay))

暂停可以阻止后续动作，但不能承诺回滚平台已经形成的推荐历史。

## 九、数据库与任务系统怎么保证不乱

数据库按职责分组，不需要一开始拆成多个服务：

| 表组 | 核心内容 |
|---|---|
| `tags / tag_edges / tag_aliases` | 标签目录与关联 |
| `profiles / user_tag_preferences` | 用户明确偏好与学习偏好 |
| `sources / source_policies / source_checkpoints` | 数据源、使用权限、采集位置 |
| `content_items / representations / content_tags` | 内容、文本或向量表示、分类结果 |
| `entities / content_entity_links` | 项目、版本、主题实体与内容关系 |
| `feedback_events / feed_sessions / feed_entries` | 用户反馈与每次实际展示结果 |
| `devices / platform_bindings` | 浏览器设备与平台账号绑定 |
| `runs / actions / action_receipts` | 原生调校任务与执行结果 |
| `feed_snapshots` | 经过允许方式获取的原生推荐样本 |
| `outbox_jobs / usage_ledger` | 待派发任务、API 与模型用量 |

公共内容唯一键使用 `(platform, external_id)`；用户事件用唯一 `event_id`；操作用唯一 `action_id`。每个私有表都带 `user_id`。

数据库启用行级安全策略，但不能只“打开 RLS”就认为结束：FastAPI 使用非表所有者、无绕过 RLS 权限的数据库角色，在每个事务内设置已校验的用户身份，再由策略限制对应行。Supabase 文档也明确区分了 RLS 与可绕过它的角色。([supabase.com](https://supabase.com/docs/guides/database/postgres/row-level-security))

Celery 分三类队列：`ingest` 采集、`analyze` 分析、`maintenance` 刷新与清理。Redis 只负责队列和短期缓存，数据库才是任务状态的最终依据。

采集时把“新增内容＋下一步任务＋采集游标”放在同一个数据库事务里提交。后台再派发任务，避免内容保存了却忘了分析，或游标前进了内容却没存下来。

任务按可重复投递设计，处理函数必须幂等；Celery 官方也强调这一点。模型分析使用缓存键去重，平台写操作则采用前面那套核验机制。([docs.celeryq.dev](https://docs.celeryq.dev/en/stable/userguide/tasks.html))

## 十、API、部署与运维具体定法

主要接口固定为：

```text
GET    /v1/taxonomy
PUT    /v1/me/profile
GET    /v1/feed
POST   /v1/feedback

POST   /v1/devices/register
POST   /v1/platform-bindings
POST   /v1/runs
GET    /v1/runs/{id}
POST   /v1/runs/{id}/pause
POST   /v1/actions/{id}/receipt

GET    /v1/evaluations
DELETE /v1/me/data
```

后端 Pydantic 模型生成 OpenAPI，再生成 TypeScript 客户端；前端与扩展不各自维护一份容易漂移的接口类型。

初始部署选择 **GCP `e2-standard-4`，4 vCPU、16 GB 内存**，运行容器；这是待压测的初始配置，不是已经证明能承载多少用户。([cloud.google.com](https://cloud.google.com/compute/docs/general-purpose-machines))

容器只有：

```text
web
api
worker-ingest
worker-analyze
beat
redis
caddy
```

数据库、认证和私有文件存储放在 Supabase。Next.js 使用 standalone 方式自托管，Caddy 处理入口 HTTPS 和反向代理。Next.js 官方支持自托管部署。([nextjs.org](https://nextjs.org/docs/app/guides/self-hosting))

监控采用 **Sentry 错误上报＋结构化 JSON 日志＋数据库用量看板**。至少记录：采集延迟、来源错误率、剩余配额、模型费用、内容分析失败率、动作核验失败率。日志不记录 Cookie、令牌和完整私人页面内容。

密钥放 GCP Secret Manager，CI 使用 GitHub Actions 构建镜像、运行测试、执行迁移并部署。生产与测试使用不同数据库和密钥；测试环境不触发真实平台账号写操作。

## 十一、怎么验收它真的做成了，而不是只做出漂亮 demo

**聚合模式验收的是推荐质量。**  
准备人工标注的内容集，比较“只按关键词”“标签规则”“加入语义与内容分析”三种方案。测试集按作者或频道隔离，避免同一个频道同时出现在训练调参和验收数据里。

初始目标可设为：前 20 条中至少 80% 被目标用户认为值得看；明确屏蔽的来源不得出现；每条推荐能追溯匹配依据。这些是验收目标，不是当前成绩。

**执行器验收的是可靠性。**  
在模拟页面里测试：worker 被杀、断网、账号切换、页面结构变化、授权撤销、回执丢失、用户暂停。尤其要证明“恢复后不重复执行写操作”。

Playwright 可以用于加载和测试 Chrome 扩展，不过需要按其扩展测试方式使用持久化 Chromium 上下文。([playwright.dev](https://playwright.dev/docs/chrome-extensions))

**养 feed 验收的是原平台的变化。**  
在允许的实验条件下，比较同时期处理组和对照组的原生推荐样本，记录相关内容比例、分心内容比例、来源多样性，以及停止调校后的保留效果。评估时关闭我们自己的筛选和重排，避免把展示层改善误认为平台算法改善。

YouTube 官方说明观看历史、搜索历史、订阅与反馈等信号参与推荐，但这只能说明影响机制存在，不能推出我们的自动操作一定有效。([support.google.com](https://support.google.com/youtube/answer/16089387))

**真正的成功标准是：用户直接打开原平台，也能感受到 feed 更符合自己的目标。**

## 十二、实际开发顺序

我会按这六个里程碑推进，不先埋头做完整标签库：

| 顺序 | 交付物 | 进入下一步的条件 |
|---|---|---|
| 1 | YouTube 能力与权限矩阵、原生执行器最小实验 | 明确哪些关键动作能合法接入，哪些仍受阻 |
| 2 | Chrome 扩展骨架、账号核验、模拟 feed 状态机 | 可暂停、可恢复、不误操作账号、不重复写 |
| 3 | 标签目录、偏好 API、onboarding | 同一偏好可同时供 A 与 B 使用 |
| 4 | 聚合连接器、内容库、去重、定时任务 | 能持续增量采集，并处理限流与删除 |
| 5 | 向量召回、结构化分析、反馈更新 | 相比关键词基线有可测量的质量提升 |
| 6 | 真实平台获准执行与原生 feed 对照实验 | 证明 B 的效果，而不只是 A 的过滤效果 |

**最终判断：工程上不缺可选技术，真正需要优先打穿的是 B 的“可用动作＋平台许可＋实际效果”。** 这三项没有落实，继续堆模型、标签和 agent 框架都不能补上核心缺口。

**Confidence Level：基础架构与聚合模式实现方案，高；本地执行器的工程可实现性，较高；YouTube 全自动养 feed 的商用可行性，目前不足以给出高置信判断。**

**Key caveats：这是一份明确的实现规格，还不是经过集成测试的代码；平台审核未完成，浏览器页面适配未实测，原生推荐改善也需要对照实验验证。**
