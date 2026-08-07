import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTaskBatches, importTasks } from '@/lib/db/schema';
import { writeTrace } from '@/lib/trace';

/**
 * Recomputes the task status whenever a batch completes. Safe to call from
 * multiple workers concurrently: the final UPDATE only wins once.
 */
export async function finalizeTaskIfNeeded(taskId: string, traceId: string): Promise<void> {
  const counts = await db
    .select({
      status: importTaskBatches.status,
      count: sql<number>`count(*)::int`,
    })
    .from(importTaskBatches)
    .where(eq(importTaskBatches.taskId, taskId))
    .groupBy(importTaskBatches.status);

  const byStatus = new Map(counts.map((r) => [r.status, Number(r.count)]));
  const completed = byStatus.get('completed') ?? 0;
  const failed = byStatus.get('failed') ?? 0;
  const pending = byStatus.get('pending') ?? 0;
  const processing = byStatus.get('processing') ?? 0;
  const retry = byStatus.get('retry') ?? 0;
  const unfinished = pending + processing + retry;

  if (unfinished > 0) return;

  const task = await db
    .select({
      id: importTasks.id,
      status: importTasks.status,
      totalBatches: importTasks.totalBatches,
      failedRows: importTasks.failedRows,
      successRows: importTasks.successRows,
      degraded: importTasks.degraded,
    })
    .from(importTasks)
    .where(eq(importTasks.id, taskId))
    .limit(1);

  const current = task[0];
  if (!current) return;
  if (!['pending', 'processing'].includes(current.status)) return;

  let status: 'completed' | 'partial_success' | 'failed';
  if (failed === current.totalBatches || (failed > 0 && completed === 0)) {
    status = 'failed';
  } else if (Number(current.failedRows) > 0 || failed > 0) {
    status = 'partial_success';
  } else {
    status = 'completed';
  }

  const [updated] = await db
    .update(importTasks)
    .set({ status, completedAt: new Date(), updatedAt: new Date() })
    .where(eq(importTasks.id, taskId))
    .returning({ status: importTasks.status });

  if (!updated) return;

  const message = `任务完成：成功 ${current.successRows} 行，失败 ${current.failedRows} 行，状态 ${status}${current.degraded ? '，SKU 校验已降级' : ''}`;
  await writeTrace({
    traceId,
    taskId,
    eventName: status === 'completed' ? 'ImportTaskCompleted' : status === 'partial_success' ? 'ImportTaskPartialSuccess' : 'ImportTaskFailed',
    eventStatus: status === 'completed' ? 'success' : status === 'partial_success' ? 'warning' : 'error',
    message,
  });
}
