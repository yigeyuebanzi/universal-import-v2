import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventOutbox } from '@/lib/db/schema';
import { enqueueBatch, type BatchJobPayload } from '@/lib/queue';
import { writeTrace } from '@/lib/trace';
import { getQueueDriver } from '@/lib/config';

type OutboxDbRow = {
  id: string;
  event_id: string;
  event_type: string;
  aggregate_id: string;
  trace_id: string;
  payload: BatchJobPayload;
  status: string;
  retry_count: number;
};

/**
 * Polls the outbox and hands every due event to the queue. Rows are claimed
 * with FOR UPDATE SKIP LOCKED so multiple dispatcher instances never enqueue
 * the same event twice. A crash between enqueue and status update is harmless:
 * BullMQ's deterministic jobId makes the re-enqueue idempotent.
 */
export async function dispatchPendingOutbox(
  limit = 50,
  enqueue: (payload: BatchJobPayload) => Promise<unknown> = enqueueBatch
): Promise<number> {
  const dbRows = (await db.execute(sql`
    SELECT id, event_id, event_type, aggregate_id, trace_id, payload, status, retry_count
    FROM event_outbox
    WHERE status IN ('pending', 'failed')
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    ORDER BY created_at ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `)) as unknown as OutboxDbRow[];

  const rows = dbRows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    eventType: r.event_type,
    aggregateId: r.aggregate_id,
    traceId: r.trace_id,
    payload: r.payload,
    status: r.status,
    retryCount: r.retry_count,
  }));

  let dispatched = 0;
  for (const row of rows) {
    try {
      if (getQueueDriver() === 'db') {
        // Serverless pull mode: batches are claimed directly by /api/cron/process,
        // so the outbox event only needs to be marked delivered.
        await db
          .update(eventOutbox)
          .set({ status: 'sent', sentAt: new Date(), lastError: null })
          .where(eq(eventOutbox.id, row.id));
        dispatched++;
        continue;
      }
      await enqueue(row.payload as BatchJobPayload);
      await db
        .update(eventOutbox)
        .set({ status: 'sent', sentAt: new Date(), lastError: null })
        .where(eq(eventOutbox.id, row.id));
      dispatched++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryCount = row.retryCount + 1;
      const backoffMs = Math.min(60_000, 1000 * 2 ** Math.min(retryCount, 6));
      await db
        .update(eventOutbox)
        .set({
          status: 'failed',
          retryCount,
          nextRetryAt: new Date(Date.now() + backoffMs),
          lastError: message,
        })
        .where(eq(eventOutbox.id, row.id));
      await writeTrace({
        traceId: row.traceId,
        taskId: row.aggregateId,
        eventName: 'OutboxDispatchFailed',
        eventStatus: 'error',
        message: `outbox ${row.eventId} 投递失败：${message}`,
      });
    }
  }

  return dispatched;
}

export async function hasPendingOutbox(taskId: string): Promise<boolean> {
  const rows = await db
    .select({ id: eventOutbox.id })
    .from(eventOutbox)
    .where(
      and(
        eq(eventOutbox.aggregateId, taskId),
        sql`${eventOutbox.status} IN ('pending', 'failed')`,
        sql`(${eventOutbox.nextRetryAt} IS NULL OR ${eventOutbox.nextRetryAt} <= now())`
      )
    )
    .limit(1);
  return rows.length > 0;
}
