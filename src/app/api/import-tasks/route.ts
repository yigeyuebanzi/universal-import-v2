import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTasks, parseRules } from '@/lib/db/schema';
import { checkApiKey } from '@/lib/auth';
import { detectFileKind, countFileRows } from '@/lib/import/file-reader';
import { saveUpload, deleteUpload } from '@/lib/storage';
import { createImportTask } from '@/lib/import/task-service';
import type { ParseRule } from '@/lib/rules/types';

const MAX_FILE_BYTES = 60 * 1024 * 1024;

export async function GET(request: Request) {
  const authError = checkApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
  const tasks = await db
    .select({
      id: importTasks.id,
      traceId: importTasks.traceId,
      fileName: importTasks.fileName,
      status: importTasks.status,
      totalRows: importTasks.totalRows,
      processedRows: importTasks.processedRows,
      successRows: importTasks.successRows,
      failedRows: importTasks.failedRows,
      totalBatches: importTasks.totalBatches,
      completedBatches: importTasks.completedBatches,
      degraded: importTasks.degraded,
      createdAt: importTasks.createdAt,
      completedAt: importTasks.completedAt,
    })
    .from(importTasks)
    .orderBy(desc(importTasks.createdAt))
    .limit(limit);

  return NextResponse.json({
    data: tasks.map((t) => ({
      id: t.id,
      trace_id: t.traceId,
      file_name: t.fileName,
      status: t.status,
      total_rows: t.totalRows,
      processed_rows: t.processedRows,
      success_rows: t.successRows,
      failed_rows: t.failedRows,
      total_batches: t.totalBatches,
      completed_batches: t.completedBatches,
      degraded: t.degraded,
      created_at: t.createdAt,
      completed_at: t.completedAt,
    })),
  });
}

export async function POST(request: Request) {
  const authError = checkApiKey(request);
  if (authError) return authError;

  const startedAt = performance.now();
  try {
    const form = await request.formData();
    const file = form.get('file');
    const ruleIdRaw = form.get('ruleId');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少文件字段 file' }, { status: 400 });
    }
    if (!ruleIdRaw || typeof ruleIdRaw !== 'string') {
      return NextResponse.json({ error: '缺少解析规则 ruleId' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: '文件为空' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: '文件超过 60MB 限制' }, { status: 413 });
    }

    const kind = detectFileKind(file.name);
    if (kind === 'unsupported') {
      return NextResponse.json(
        { error: '文件格式不支持，仅支持 .xlsx/.xls/.docx/.pdf', error_code: 'E008' },
        { status: 400 }
      );
    }

    const ruleRows = await db
      .select({ id: parseRules.id, ruleConfig: parseRules.ruleConfig })
      .from(parseRules)
      .where(eq(parseRules.id, ruleIdRaw))
      .limit(1);
    const ruleRow = ruleRows[0];
    if (!ruleRow) {
      return NextResponse.json({ error: '解析规则不存在' }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await saveUpload(buffer, file.name);

    let totalRows = 0;
    try {
      totalRows = await countFileRows(stored.ref, kind, ruleRow.ruleConfig as unknown as ParseRule);
    } catch (err) {
      console.error('[import] pre-scan failed for', stored.ref, err);
      await deleteUpload(stored.ref);
      return NextResponse.json(
        {
          error: `文件预扫描失败：${err instanceof Error ? err.message : String(err)}`,
          detail: err instanceof Error ? err.stack : undefined,
        },
        { status: 400 }
      );
    }

    const created = await createImportTask({
      fileName: file.name,
      fileRef: stored.ref,
      fileType: kind,
      ruleId: ruleIdRaw,
      totalRows,
    });

    const elapsedMs = Math.round(performance.now() - startedAt);
    console.log(
      `[import] task=${created.taskId} rows=${totalRows} batches=${created.totalBatches} uploadElapsedMs=${elapsedMs}`
    );

    return NextResponse.json(
      {
        task_id: created.taskId,
        trace_id: created.traceId,
        status: created.status,
        total_rows: created.totalRows,
        total_batches: created.totalBatches,
        elapsed_ms: elapsedMs,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[import] create task failed', err);
    return NextResponse.json(
      { error: `创建导入任务失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
