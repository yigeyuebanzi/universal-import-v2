import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTaskBatches } from '@/lib/db/schema';
import { checkApiKey } from '@/lib/auth';
import { isValidTaskId } from '@/lib/ids';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const authError = checkApiKey(request);
  if (authError) return authError;

  const { taskId } = await params;
  if (!isValidTaskId(taskId)) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(importTaskBatches)
    .where(eq(importTaskBatches.taskId, taskId))
    .orderBy(asc(importTaskBatches.batchIndex));

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      task_id: r.taskId,
      unit_id: r.unitId,
      batch_index: r.batchIndex,
      start_row: r.startRow,
      end_row: r.endRow,
      status: r.status,
      retry_count: r.retryCount,
      success_rows: r.successRows,
      failed_rows: r.failedRows,
      sku_validation_skipped: r.skuValidationSkipped,
      locked_at: r.lockedAt,
      started_at: r.startedAt,
      completed_at: r.completedAt,
      last_error: r.lastError,
    })),
  });
}
