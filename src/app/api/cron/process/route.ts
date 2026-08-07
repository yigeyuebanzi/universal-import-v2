import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventOutbox } from '@/lib/db/schema';
import { processBatchJob } from '@/lib/import/worker';
import type { BatchJobPayload } from '@/lib/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type BatchRow = {
  task_id: string;
  unit_id: string;
  batch_index: number;
  start_row: number;
  end_row: number;
  trace_id: string;
  file_ref: string;
  file_type: 'excel' | 'word' | 'pdf';
  rule_id: string | null;
};

/**
 * Serverless pull worker for Vercel: claims pending/retry batches and executes
 * them inside the cron invocation. `processBatchJob` keeps the batch state
 * machine and idempotency guarantees, so concurrent cron runs are safe.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(10, Math.max(1, Number(process.env.CRON_PROCESS_BATCHES ?? 4)));
  const rows = (await db.execute(sql`
    SELECT b.task_id, b.unit_id, b.batch_index, b.start_row, b.end_row,
           t.trace_id, t.file_ref, t.file_type, t.rule_id
    FROM import_task_batches b
    JOIN import_tasks t ON t.id = b.task_id
    WHERE b.status IN ('pending', 'retry')
    ORDER BY t.created_at ASC, b.batch_index ASC
    LIMIT ${limit}
  `)) as unknown as BatchRow[];

  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    const payload: BatchJobPayload = {
      taskId: row.task_id,
      unitId: row.unit_id,
      batchIndex: row.batch_index,
      startRow: row.start_row,
      endRow: row.end_row,
      traceId: row.trace_id,
      fileRef: row.file_ref,
      fileType: row.file_type,
      ruleId: row.rule_id,
    };
    try {
      await processBatchJob(payload);
      await db
        .update(eventOutbox)
        .set({ status: 'sent', sentAt: new Date(), lastError: null })
        .where(
          and(
            eq(eventOutbox.aggregateId, row.task_id),
            sql`${eventOutbox.payload}->>'unitId' = ${row.unit_id}`
          )
        );
      processed++;
    } catch (err) {
      failed++;
      console.error(`[cron/process] batch ${row.task_id}/${row.unit_id} failed`, err);
    }
  }

  return NextResponse.json({ ok: true, processed, failed, remaining: rows.length - processed });
}
