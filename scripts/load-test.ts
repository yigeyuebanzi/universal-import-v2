import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import ExcelJS from 'exceljs';

interface UploadResult {
  index: number;
  elapsedMs: number;
  status: number;
  body: { task_id?: string; trace_id?: string; total_rows?: number; total_batches?: number };
}

interface TaskStatus {
  task_id: string;
  trace_id: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  total_batches: number;
  completed_batches: number;
  degraded: boolean;
  created_at: string | null;
  completed_at: string | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[idx];
}

async function main() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const apiKey = process.env.IMPORT_API_KEY ?? '';
  const filePath = process.env.LOAD_TEST_FILE ?? path.resolve(process.cwd(), 'test-data/10000-orders.xlsx');
  const uploadRounds = Number(process.env.LOAD_TEST_UPLOADS ?? 5);
  const pollIntervalMs = Number(process.env.LOAD_TEST_POLL_MS ?? 1000);
  const maxWaitMs = Number(process.env.LOAD_TEST_MAX_WAIT_MS ?? 120_000);

  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  console.log(`[load-test] baseUrl=${baseUrl} file=${filePath} uploads=${uploadRounds}`);
  const fileBuffer = await readFile(filePath);
  const file = new File([fileBuffer], path.basename(filePath), {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  // Resolve the load-test rule id through the public rules API.
  const rulesRes = await fetch(`${baseUrl}/api/rules`, { headers });
  if (!rulesRes.ok) throw new Error(`获取规则列表失败: ${rulesRes.status}`);
  const rulesBody = (await rulesRes.json()) as {
    success?: boolean;
    data?: { id: string; name: string }[];
  };
  const rule = (rulesBody.data ?? []).find((r) => r.name === '压测-10000行运单');
  if (!rule) throw new Error('未找到压测规则「压测-10000行运单」，请先运行 npm run seed');

  const uploads: UploadResult[] = [];
  let firstTaskId: string | null = null;
  let firstTraceId: string | null = null;

  // Warm-up round: compiles the serverless route on the first call and uses a
  // tiny WARM_ file so it cannot pollute the ORDER_ keys used by the real file.
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('运单');
    ws.addRow(['外部单号', '门店名称', '收货人', '手机号', '收货地址', 'SKU编码', 'SKU名称', '数量', '规格', '备注']);
    for (let i = 1; i <= 10; i++) {
      ws.addRow([
        `WARM_${String(i).padStart(5, '0')}`,
        '上海总仓',
        '张三',
        '13800000000',
        '上海市浦东新区测试路1号',
        'SKU_00001',
        '压测商品1',
        1,
        '1kg',
        '',
      ]);
    }
    const warmPath = path.resolve(process.cwd(), 'data/warmup-10-orders.xlsx');
    await mkdir(path.dirname(warmPath), { recursive: true });
    await wb.xlsx.writeFile(warmPath);
    const warmBuffer = await readFile(warmPath);
    const form = new FormData();
    form.append(
      'file',
      new File([warmBuffer], 'warmup-10-orders.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'warmup-10-orders.xlsx'
    );
    form.append('ruleId', rule.id);
    const res = await fetch(`${baseUrl}/api/import-tasks`, {
      method: 'POST',
      headers,
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as UploadResult['body'];
    if (!body.task_id) throw new Error(`预热上传失败: ${res.status}`);
    console.log(`[load-test] warm-up upload: ${res.status} task=${body.task_id}`);
  }

  for (let i = 0; i < uploadRounds; i++) {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('ruleId', rule.id);

    const started = performance.now();
    const res = await fetch(`${baseUrl}/api/import-tasks`, {
      method: 'POST',
      headers,
      body: form,
    });
    const elapsedMs = Math.round(performance.now() - started);
    const body = (await res.json().catch(() => ({}))) as UploadResult['body'];
    uploads.push({ index: i + 1, elapsedMs, status: res.status, body });
    if (!firstTaskId && body.task_id) {
      firstTaskId = body.task_id;
      firstTraceId = body.trace_id ?? null;
    }
    console.log(`[load-test] upload #${i + 1}: ${res.status} ${elapsedMs}ms task=${body.task_id ?? '-'}`);
  }

  if (!firstTaskId) {
    throw new Error('上传均未返回 task_id');
  }

  const uploadElapsed = uploads.map((u) => u.elapsedMs).sort((a, b) => a - b);
  const uploadP95 = percentile(uploadElapsed, 0.95);
  const uploadErrors = uploads.filter((u) => u.status >= 500).length;

  // Poll the first task until terminal.
  const taskStart = Date.now();
  let task: TaskStatus | null = null;
  let httpErrors: string[] = [];
  while (Date.now() - taskStart < maxWaitMs) {
    const res = await fetch(`${baseUrl}/api/import-tasks/${firstTaskId}`, { headers });
    if (!res.ok) {
      httpErrors.push(`${firstTaskId}:${res.status}`);
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }
    task = (await res.json()) as TaskStatus;
    if (['completed', 'partial_success', 'failed'].includes(task.status)) break;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  if (!task || !['completed', 'partial_success', 'failed'].includes(task.status)) {
    throw new Error('任务未在超时时间内完成');
  }

  const totalMs = Date.now() - taskStart;
  const ok = totalMs <= 60_000 && uploadP95 <= 1000 && uploadErrors === 0 && httpErrors.length === 0;

  const report = {
    generated_at: new Date().toISOString(),
    environment: {
      base_url: baseUrl,
      node: process.version,
      worker_concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
      batch_size: Number(process.env.BATCH_SIZE ?? 1000),
      database_pool_size: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    },
    file: {
      path: filePath,
      bytes: fileBuffer.length,
    },
    uploads: {
      rounds: uploadRounds,
      all_ms: uploadElapsed,
      p95_ms: uploadP95,
      max_ms: uploadElapsed[uploadElapsed.length - 1] ?? 0,
      http_5xx: uploadErrors,
    },
    task: {
      task_id: firstTaskId,
      trace_id: firstTraceId,
      status: task.status,
      total_rows: task.total_rows,
      success_rows: task.success_rows,
      failed_rows: task.failed_rows,
      processed_rows: task.processed_rows,
      total_batches: task.total_batches,
      completed_batches: task.completed_batches,
      degraded: task.degraded,
      total_elapsed_ms: totalMs,
      within_60s: totalMs <= 60_000,
      poll_http_errors: httpErrors,
    },
    result: ok ? 'PASS' : 'FAIL',
  };

  const reportDir = path.resolve(process.cwd(), 'reports');
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `load-test-report-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log('==================== 压测结果 ====================');
  console.log(`上传 P95: ${uploadP95}ms（目标 ≤1000ms）`);
  console.log(`任务总耗时: ${totalMs}ms（目标 ≤60000ms）`);
  console.log(`任务状态: ${task.status}，成功 ${task.success_rows}，失败 ${task.failed_rows}`);
  console.log(`HTTP 5xx: 上传 ${uploadErrors} 个，轮询 ${httpErrors.length} 个`);
  console.log(`结论: ${ok ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`报告: ${reportPath}`);

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[load-test] 失败', err);
  process.exit(1);
});
