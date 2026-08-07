# 接口文档

所有接口返回 JSON。若设置了 `IMPORT_API_KEY`，请求需携带 `x-api-key: <key>` 或 `Authorization: Bearer <key>`。

## POST /api/import-tasks

上传文件并创建异步导入任务。请求为 `multipart/form-data`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `file` | File | .xlsx / .xls / .docx / .pdf，≤ 60MB |
| `ruleId` | string | 解析规则 ID（复用 V2 规则引擎） |

响应 `201`：

```json
{
  "task_id": "task_xxx",
  "trace_id": "trace_xxx",
  "status": "pending",
  "total_rows": 10000,
  "total_batches": 10,
  "elapsed_ms": 387
}
```

## GET /api/import-tasks?limit=20

最近任务列表。

## GET /api/import-tasks/:taskId

任务进度：

```json
{
  "task_id": "task_123",
  "trace_id": "trace_abc",
  "file_name": "10000-orders.xlsx",
  "status": "partial_success",
  "total_rows": 10000,
  "processed_rows": 10000,
  "success_rows": 9920,
  "failed_rows": 80,
  "degraded_rows": 0,
  "total_batches": 10,
  "completed_batches": 10,
  "degraded": false,
  "throughput_per_minute": 46275,
  "eta_seconds": 0
}
```

非法/不存在 `task_id` 返回 `404`。

## GET /api/import-tasks/:taskId/errors

行级错误分页查询：

| 参数 | 说明 |
|---|---|
| `batch` | 批次号 |
| `error_code` | 错误码（E001~E008） |
| `row_from` / `row_to` | 行号范围 |
| `page` / `page_size` | 分页（默认 1 / 50） |

```json
{
  "data": [
    {
      "id": "uuid",
      "task_id": "task_123",
      "unit_id": "unit_001",
      "batch_index": 1,
      "row_number": 2,
      "field_name": "skuCode",
      "raw_value": "SKU_90001",
      "error_code": "E001",
      "error_code_label": "SKU 不存在",
      "error_reason": "SKU SKU_90001 不存在于商品主数据",
      "suggestion": "检查 SKU 编码是否存在于商品主数据，修正后重试",
      "trace_id": "trace_abc"
    }
  ],
  "total": 80,
  "page": 1,
  "page_size": 50
}
```

## GET /api/import-tasks/:taskId/errors/export

导出 CSV（UTF-8 BOM，含表头；敏感字段已脱敏）。

## GET /api/import-tasks/:taskId/batches

批次状态与性能列表：

```json
{
  "data": [
    {
      "id": "uuid",
      "task_id": "task_123",
      "unit_id": "unit_001",
      "batch_index": 1,
      "start_row": 1,
      "end_row": 1000,
      "status": "completed",
      "retry_count": 0,
      "success_rows": 920,
      "failed_rows": 80,
      "sku_validation_skipped": false
    }
  ]
}
```

## GET /api/traces/:traceId

按 trace_id 返回时间线：

```json
{
  "trace_id": "trace_abc",
  "tasks": [{ "id": "task_123", "file_name": "10000-orders.xlsx", "status": "partial_success" }],
  "events": [
    {
      "event_name": "ImportTaskCreated",
      "event_status": "info",
      "message": "任务已创建：10000 行，10 个处理单元",
      "occurred_at": "2026-08-07T00:43:16.249Z"
    }
  ]
}
```

## GET /api/traces/search

支持组合检索：`task_id`、`trace_id`、`file_name`、`batch`、`row_from`、`row_to`、`error_code`、`limit`。返回命中任务、失败节点与时间线事件。

## GET /api/import-monitor/summary

监控聚合：

```json
{
  "throughput": [{ "minute": "00:43", "rows": 9919 }],
  "backlog": {
    "pending_batches": 0,
    "pending_events": 0,
    "processing_batches": 2,
    "estimated_pending_rows": 0,
    "threshold_rows": 5000
  },
  "redis": { "waiting": 0, "active": 2, "delayed": 0, "failed": 0 },
  "stages": [
    { "stage": "parse", "p50": "749.0", "p95": "1221.3", "p99": "1337.1" },
    { "stage": "rule", "p50": "13.0", "p95": "27.7", "p99": "33.0" },
    { "stage": "validate", "p50": "25.5", "p95": "41.1", "p99": "84.3" },
    { "stage": "insert", "p50": "215.0", "p95": "392.3", "p99": "417.4" }
  ],
  "error_distribution": [{ "error_code": "E001", "cnt": 30 }],
  "slow_batches_top10": [],
  "task_trend": [],
  "alerts": []
}
```

## GET /api/cron/dispatch

Vercel Cron 兜底：轮询 Outbox 并投递队列（每分钟）。可通过 `Authorization: Bearer $CRON_SECRET` 保护。

## GET /api/cron/sweep

Vercel Cron 兜底：恢复卡死批次、重建丢失 Outbox 事件（每 5 分钟）。

## 事件信封

Outbox / Trace 使用统一信封：

```json
{
  "event_id": "evt_123",
  "event_type": "ImportBatchCreated",
  "schema_version": 1,
  "aggregate_id": "task_123",
  "trace_id": "trace_abc",
  "occurred_at": "2026-08-03T10:00:00.000Z",
  "payload": {
    "task_id": "task_123",
    "unit_id": "unit_001",
    "batch_index": 1,
    "start_row": 1,
    "end_row": 1200
  }
}
```

已定义事件：

| 事件 | 生产者 | 消费者 |
|---|---|---|
| `ImportTaskCreated` | 上传 API | Dispatcher / Worker |
| `ImportBatchCreated` | 上传 API / Outbox | Worker |
| `ImportBatchStarted` | Worker | Trace / Monitor |
| `ImportBatchSucceeded` | Worker | Task Aggregator |
| `ImportBatchFailed` | Worker | Task Aggregator / Alert |
| `ImportTaskCompleted` | Worker / Aggregator | Monitor |
| `ImportTaskPartialSuccess` | Worker / Aggregator | Monitor |
| `ImportTaskDegraded` | Worker | Monitor / UI |

字段变更策略：所有事件带 `schema_version`；新增字段向后兼容；消费端忽略未知字段；语义重大变化时递增版本。
