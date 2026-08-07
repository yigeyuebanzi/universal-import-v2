import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTasks } from '@/lib/db/schema';
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

  const rows = await db.select().from(importTasks).where(eq(importTasks.id, taskId)).limit(1);
  const task = rows[0];
  if (!task) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  }

  const createdAt = task.createdAt ? new Date(task.createdAt).getTime() : Date.now();
  const elapsedSec = Math.max(1, (Date.now() - createdAt) / 1000);
  const throughputPerMinute = Math.round((task.successRows / elapsedSec) * 60);
  const remainingRows = Math.max(0, task.totalRows - task.processedRows);
  const etaSeconds =
    throughputPerMinute > 0 ? Math.round((remainingRows / throughputPerMinute) * 60) : null;

  return NextResponse.json({
    task_id: task.id,
    trace_id: task.traceId,
    file_name: task.fileName,
    status: task.status,
    total_rows: task.totalRows,
    processed_rows: task.processedRows,
    success_rows: task.successRows,
    failed_rows: task.failedRows,
    degraded_rows: task.degradedRows,
    total_batches: task.totalBatches,
    completed_batches: task.completedBatches,
    degraded: task.degraded,
    degraded_at: task.degradedAt,
    error: task.error,
    created_at: task.createdAt,
    completed_at: task.completedAt,
    throughput_per_minute: throughputPerMinute,
    eta_seconds: etaSeconds,
  });
}
