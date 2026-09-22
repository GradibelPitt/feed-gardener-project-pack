# Jev × Crawler 交付审查与并入记录

日期：2026-09-22。审查输入：`/Users/marsh/Desktop/feeder-jev-crawler-redesign/` 中的 README、两份评审/集成文档和五个代码文件。该目录是设计交付，不是可直接并入的 Git 分支。

## 已并入

- 复用 `POST /api/agent/v1/decisions/preview`、`lib/candidate-decision.ts` 与原有响应包络，加入服务端六小时标题评分缓存。同标题、同 tags、同请求模型和同 rubric 复用 Jev 分数；不同预算仍独立执行程序策略。并发相同请求在同一进程合并为一次 Jev 调用。
- 缓存沿用交付稿的 `node:sqlite` 方向，但使用实际评分输入生成键。交付稿的 `(HarvestItem.id, tagsHash)` 会在标题、权重或模型变化后错误命中，也允许客户端构造相同 ID 覆盖分数。新数据库不写标题、tags、URL 或外部来源 ID，并按六小时淘汰。
- `.data/` 被 Git 忽略。Web、CLI、测试和生产构建均启用 Node SQLite。缓存不可用时，评分仍走 Jev；无 Jev key 时不会从缓存冒充实时可用。

## 暂缓并入的交付代码

| 文件/建议 | 审查结果 |
|---|---|
| `lib/jev-batch.ts` 的数组 `state` | [TypeSafe API](https://docs.typesafe.ai/api) 接受数组作为单份 `state` 内容，但其响应定义为每个 **question** 一个 answer；没有确认每个数组元素各返回一套 `results`。交付代码把数组输入误当批量协议，不能以此声称减少 N 次 HTTP。 |
| `lib/jev-questions.ts` | 官方题型为 `noul`、`choice`、`score`；交付稿的 `enum`/`values` 不是该合同。多题请求本身可用，但项目当前内部目标明确要求 Jev 只回答标题相关度题，故没有增加邻近度、深度、内容类型或权重 prompt。 |
| `lib/jev-batch.ts` 的低置信度 summary 追问 | 当前产品合同限定标题证据；加入 summary 会改变 `evidenceBasis: title_only` 的含义。低置信度继续如实显示与排除，不以第二次不同输入的评分覆盖。 |
| `lib/candidate-prefilter.ts` | 无标签交集不等于不相关。交付稿会在高目标均分时跳过真实候选，也把目标均分混入候选准入；当前目标要求 Jev 对合规候选打分并显示实际未达标状态。 |
| `app/api/agent/v1/decisions/batch/route.ts` | 新 Route 未加入 `API_INTERFACES`，SSE 输出未用统一 `{ data, meta }` / `{ error, meta }` 合同；请求可自报 `id` 和 metadata，且缓存键不覆盖实际标题/模型。当前调用方仍使用既有 preview Route，新增同义端点不符合接口治理规则。 |
| `lib/crawler/harvest.ts` 的标题+日期去重 | 相同标题和日期可能是不同作品；交付伪代码还会丢失第二来源的 provenance。保持现有 URL 去重，待有可保留多来源归属的结构再评估。 |

交付文档的调用减少比例、首屏时间和缓存命中率是估算，不是实测结果。未来若要上线批量或流式评分，应先确认 Jev 批量合同，再复用或兼容扩展现有接口，保留标题证据与来源许可边界，并为真实调用方和错误路径补测试。
