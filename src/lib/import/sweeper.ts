import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { eventOutbox, importTaskBatches, importTasks } from '@/lib/db/schema';
import { newEventId } from '@/lib/ids';
import { writeTrace } from '@/lib/trace';
import { finalizeTaskIfNeeded } from '@/lib/import/aggregator';
import type { BatchJobPayload } from '@/lib/queue';

/**
 * Recovers batches that stayed in `processing` longer than the stale window
 * (worker crash / hung job). Retryable batches get a fresh outbox event so the
 * dispatcher re-enqueues them; exhausted batches are marked failed.
 */
export async function sweepStaleBatches(): Promise<number> {
  const staleAt = new Date(Date.now() - config.staleBatchMinutes * 60_000).toISOString();
  const stale = await db
    .select()
    .from(importTaskBatches)
    .where(
      and(
        eq(importTaskBatches.status, 'processing'),
        sql`${importTaskBatches.lockedAt} < ${staleAt}`
      )
    )
    .limit(100);

  let recovered = 0;
  for (const batch of stale) {
    const retryCount = batch.retryCount + 1;
    if (retryCount < config.batchMaxRetries) {
      await db
        .update(importTaskBatches)
        .set({ status: 'retry', retryCount, lockedAt: null })
        .where(eq(importTaskBatches.id, batch.id));

      const task = await db
        .select({ traceId: importTasks.traceId, fileRef: importTasks.fileRef, fileType: importTasks.fileType, ruleId: importTasks.ruleId })
        .from(importTasks)
        .where(eq(importTasks.id, batch.taskId))
        .limit(1);
      const t = task[0];
      if (!t) continue;

      const payload: BatchJobPayload = {
        taskId: batch.taskId,
        unitId: batch.unitId,
        batchIndex: batch.batchIndex,
        startRow: batch.startRow,
        endRow: batch.endRow,
        traceId: t.traceId,
        fileRef: t.fileRef,
        fileType: t.fileType as 'excel' | 'word' | 'pdf',
        ruleId: t.ruleId,
      };
      await db.insert(eventOutbox).values({
        eventId: newEventId(),
        eventType: 'ImportBatchRetry',
        schemaVersion: 1,
        aggregateId: batch.taskId,
        traceId: t.traceId,
        payload,
        status: 'pending',
      });
      await writeTrace({
        traceId: t.traceId,
        taskId: batch.taskId,
        unitId: batch.unitId,
        eventName: 'ImportBatchRecovered',
        eventStatus: 'warning',
        message: `批次 ${batch.unitId} 超时恢复，重试次数 ${retryCount}`,
      });
      recovered++;
    } else {
      await db
        .update(importTaskBatches)
        .set({ status: 'failed', lockedAt: null, completedAt: new Date(), lastError: '批次超时且重试次数耗尽' })
        .where(eq(importTaskBatches.id, batch.id));
      await db
        .update(importTasks)
        .set({ error: '存在批次超时失败', updatedAt: new Date() })
        .where(eq(importTasks.id, batch.taskId));
      const task = await db
        .select({ traceId: importTasks.traceId })
        .from(importTasks)
        .where(eq(importTasks.id, batch.taskId))
        .limit(1);
      if (task[0]) {
        await writeTrace({
          traceId: task[0].traceId,
          taskId: batch.taskId,
          unitId: batch.unitId,
          eventName: 'ImportBatchFailed',
          eventStatus: 'error',
          message: '批次超时且重试次数耗尽',
        });
        await finalizeTaskIfNeeded(batch.taskId, task[0].traceId);
      }
      recovered++;
    }
  }
  return recovered;
}

/**
 * Safety net for the "task created but events lost" scenario: if a task has
 * batches that are pending/retry but no outbox event waiting, recreate events.
 */
export async function recoverLostOutboxEvents(): Promise<number> {
  const pendingTasks = await db
    .select({
      id: importTasks.id,
      traceId: importTasks.traceId,
      fileRef: importTasks.fileRef,
      fileType: importTasks.fileType,
      ruleId: importTasks.ruleId,
    })
    .from(importTasks)
    .where(eq(importTasks.status, 'pending'))
    .limit(50);

  let recreated = 0;
  for (const task of pendingTasks) {
    const hasEvent = await db
      .select({ id: eventOutbox.id })
      .from(eventOutbox)
      .where(eq(eventOutbox.aggregateId, task.id))
      .limit(1);
    if (hasEvent.length > 0) continue;

    const batches = await db
      .select()
      .from(importTaskBatches)
      .where(
        and(
          eq(importTaskBatches.taskId, task.id),
          sql`${importTaskBatches.status} IN ('pending', 'retry')`
        )
      )
      .limit(config.batchSize * 2);

    for (const batch of batches) {
      const payload: BatchJobPayload = {
        taskId: task.id,
        unitId: batch.unitId,
        batchIndex: batch.batchIndex,
        startRow: batch.startRow,
        endRow: batch.endRow,
        traceId: task.traceId,
        fileRef: task.fileRef,
        fileType: task.fileType as 'excel' | 'word' | 'pdf',
        ruleId: task.ruleId,
      };
      await db.insert(eventOutbox).values({
        eventId: newEventId(),
        eventType: 'ImportBatchRecovered',
        schemaVersion: 1,
        aggregateId: task.id,
        traceId: task.traceId,
        payload,
        status: 'pending',
      });
      recreated++;
    }
  }
  return recreated;
}
