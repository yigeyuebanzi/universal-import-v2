# 万能导入 V4 · 异步事件驱动与全链路可观测性

基于 V2「万能导入解析系统」重构的异步导入链路。上传接口只创建任务并立即返回 `task_id`，文件解析、规则引擎、批量 SKU 校验、批量写库全部在后台队列中执行；每个任务/批次/行级错误都有 trace 时间线，监控看板可在 1 分钟内定位失败原因。

## 核心能力

- 上传即返回：`POST /api/import-tasks` 平均 < 400ms 返回 `task_id`（压测 P95 387ms）
- Transactional Outbox：任务、批次、Outbox 事件在同一数据库事务写入，宕机后 Dispatcher 可恢复投递
- BullMQ + Redis 队列：处理单元 Job 按 `task_id-unit_id` 幂等去重，自动重试与退避
- 批量校验：每个处理单元一次性 `IN` 查询 SKU 主数据，禁止逐行查询
- 批量写入：每个处理单元一次 `INSERT ... ON CONFLICT DO UPDATE` 批量 UPSERT
- 行级错误：`import_task_errors` 记录批次、行号、字段、脱敏原始值、错误码、原因、建议
- 全链路可观测：`trace_events` 时间线 + 监控看板（吞吐、积压、阶段 P50/P95/P99、错误分布、慢批次 TOP10）
- 容灾降级：SKU 主数据查询超时 > 3s 自动进入降级模式，跳过 SKU 校验并显著提示
- 卡死恢复：Sweeper 定时恢复超时批次、重投丢失的 Outbox 事件

## 技术栈

- Next.js 16 App Router + TypeScript
- PostgreSQL 15 + Drizzle ORM
- BullMQ 5 + Redis 7
- ExcelJS（生成压测文件）+ 自研 ZIP/SAX 流式 xlsx 读取（批次级内存）
- Vitest（单元 + 集成测试）

## 快速开始

### 1. 启动基础设施

```bash
docker compose up -d --wait
```

PostgreSQL 映射到 `localhost:5433`（避免与已有 5432 冲突），Redis 映射到 `localhost:6379`。

### 2. 配置环境变量

```bash
copy .env.example .env.local
```

本地默认值即可运行；生产环境请按下方变量表配置。

### 3. 初始化数据库与压测数据

```bash
npm install
npm run db:migrate
npm run seed
```

`npm run seed` 会：

1. 清理并写入 20,000 条 SKU 主数据（`SKU_00001` ~ `SKU_20000`）；
2. 创建/更新压测解析规则「压测-10000行运单」；
3. 生成 `test-data/10000-orders.xlsx`（10,000 行，含 30 行非法 SKU、20 行坏手机号、20 行负数量、10 行重复单号，用于验证错误定位）。

### 4. 启动服务与 Worker

```bash
npm run dev          # 终端 1，http://localhost:3000
npm run worker       # 终端 2，Outbox Dispatcher + BullMQ Worker + Sweeper
```

### 5. 页面入口

- `/import`：上传文件并选择解析规则
- `/tasks`：任务列表
- `/tasks/[taskId]`：进度、批次、行级错误、降级提示
- `/monitor`：监控看板
- `/traces`：链路追踪检索
- `/rules`：V2 规则管理（复用原规则引擎）

## 压测

```bash
npm run load-test
```

脚本执行：

1. 用 10 行 `WARM_` 文件预热上传路由（不计入指标）；
2. 连续 5 次上传 `test-data/10000-orders.xlsx`，记录上传响应时间并计算 P95；
3. 轮询第一个任务直到终态，统计全链路总耗时；
4. 校验成功/失败行数、500/504 数量；
5. 输出 `reports/load-test-report-<ts>.json`。

最近一次实测（本地 Docker，Worker 并发 4，批大小 1000）：

| 指标 | 目标 | 实测 |
|---|---:|---:|
| 上传接口 P95 | ≤ 1000ms | 387ms |
| 10,000 行全链路 | ≤ 60s | 3.34s |
| 成功行 / 失败行 | 10000 | 9920 / 80 |
| 500/504 | 0 | 0 |

详细说明见 [docs/LOAD_TEST_REPORT.md](docs/LOAD_TEST_REPORT.md)。

线上生产地址：https://universal-import-v4-brown.vercel.app （Vercel + Neon + Upstash Redis，已跑通 10,000 行线上验收）。

## 自动化测试

```bash
npm test
```

覆盖：上传接口 1s 返回、任务与 Outbox 同事务、Dispatcher 可恢复投递、Worker 批次成功、重复消费幂等、SKU 批量校验、部分失败但成功行入库、行级错误、任务聚合、降级模式、Trace 时间线、API Key 与非法 task_id 保护。

## 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_TLS` | Redis 连接（BullMQ） |
| `UPLOAD_DIR` | 本地文件存储目录（默认 `./data/uploads`） |
| `BLOB_READ_WRITE_TOKEN` | 设置后使用 Vercel Blob 保存上传文件 |
| `FILE_STORAGE` | `local`（默认）/ `db`（文件入库，Vercel 无持久磁盘时使用） |
| `IMPORT_API_KEY` | 可选；设置后所有导入/监控/Trace API 需 `x-api-key` |
| `CRON_SECRET` | Vercel Cron 鉴权 |
| `BATCH_SIZE` | 处理单元大小，默认 1000 |
| `WORKER_CONCURRENCY` | 单 Worker 并发，默认 4 |
| `QUEUE_DRIVER` | `redis`（默认，BullMQ 常驻 Worker）/ `db`（Vercel Cron 拉取处理） |
| `CRON_PROCESS_BATCHES` | 每次 Cron/上传踢单最多处理的批次数，默认 4 |
| `REDIS_URL` | 设置后且未设置 `REDIS_HOST` 时自动解析 Redis 连接 |
| `SKU_CHECK_TIMEOUT_MS` | SKU 校验超时阈值，默认 3000，超时触发降级 |
| `STALE_BATCH_MINUTES` | 批次卡死判定阈值，默认 5 |
| `BATCH_MAX_RETRIES` | 处理单元最大重试次数，默认 3 |
| `REQUIRED_FIELDS` | 必填字段列表 |
| `OPENAI_API_KEY` | 可选，仅用于 V2 AI 规则生成 |

## 部署

推荐拓扑（Vercel 无状态 + 常驻 Worker）：

- **Web/API**：Vercel（Next.js 构建），环境变量走 Neon Postgres、Upstash Redis、Vercel Blob
- **Worker + Dispatcher + Sweeper**：Railway / Render / Fly.io 常驻进程运行 `npm run worker`
- **Cron 兜底 / Serverless Worker**：`vercel.json` 已配置 `/api/cron/process` 与 `/api/cron/sweep`（Hobby 套餐为每日兜底）；`QUEUE_DRIVER=db` + `FILE_STORAGE=db` 时，上传接口会在响应后自动“踢”一次 `/api/cron/process`，不依赖常驻 Worker 即可完整跑通导入链路。需要更高频率可升级 Pro 或部署常驻 Worker

```bash
vercel deploy --prod
```

部署前必须设置全部环境变量；`vercel.json` 中的 Cron 需要 Hobby/Pro 计划支持。

也可以使用辅助脚本（会自动登录、link 项目并部署）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-vercel.ps1 -Prod
```

## 故障模拟

### Redis 不可用

停止 Redis 容器：Outbox 投递失败并记录 `retry_count`、`next_retry_at`；恢复后 Dispatcher 自动重投，Worker 幂等消费。

### SKU 校验超时

设置 `SKU_CHECK_TIMEOUT_MS=100` 或暂停数据库：任务进入降级模式，任务详情页展示“⚠️ SKU 校验已降级”，`import_tasks.degraded=true`，批次记录 `sku_validation_skipped`。

### Worker 崩溃 / 批次卡死

手动把批次置为 `processing` 且 `locked_at` 早于 5 分钟，Sweeper 会将其恢复为 `retry` 并重新投递；重试耗尽则标记 `failed` 并终态化任务。

## 事件字段变更策略

- 所有事件信封带 `schema_version`，当前为 `1`；
- 新增字段保持向后兼容，消费者忽略未知字段；
- 字段语义发生重大变化时递增 `schema_version`，并保留旧版本消费者兼容期；
- 事件契约见 [docs/API.md](docs/API.md) 与 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 交付物清单（对应考题第十三章）

| # | 考题要求 | 位置 |
|---|---|---|
| 1 | 在线地址（Vercel） | https://universal-import-v4-brown.vercel.app |
| 2 | 源码仓库 | GitHub 分支：https://github.com/yigeyuebanzi/universal-import-v2/tree/v4-async-event-driven ；本地 bundle：`../universal-import-v4.bundle` |
| 3 | 压测数据脚本（20,000 SKU） | `scripts/seed-data.ts`（`npm run seed`） |
| 4 | 10,000 行压测 Excel | `test-data/10000-orders.xlsx` |
| 5 | 压测报告 | `docs/LOAD_TEST_REPORT.md`（含本地与线上实测），原始 JSON 在 `reports/` |
| 6 | 架构设计文档 | `docs/ARCHITECTURE.md` |
| 7 | 《重构假设说明》 | `docs/REFACTORING_ASSUMPTIONS.md`（12 项要求 + 8 道反思题） |
| 8 | 接口文档 | `docs/API.md` |
| 9 | README | 本文档 |
| 10 | 演示访问说明 | 本文档「快速开始/页面入口」+ 线上地址（首次使用需输入 `IMPORT_API_KEY`） |

辅助交付物：监控/任务/Trace 截图在 `docs/screenshots/`，部署脚本 `scripts/deploy-vercel.ps1`，线上验收脚本 `scripts/verify-online.ps1`，数据库迁移 SQL 在 `drizzle/`。

## 数据清理与归档

- `npm run seed:clean`：清理压测任务、waybills、错误、性能日志、Trace、Outbox 与 SKU 主数据，再重新灌数；
- 生产环境建议按 `created_at` 分区/定时归档 `import_task_errors`、`batch_performance_log`、`trace_events`，Outbox 已投递记录定期归档（详见《重构假设说明》）。
