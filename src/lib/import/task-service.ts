import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventOutbox, importTaskBatches, importTasks, traceEvents } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { newEventId, newTaskId, newTraceId, unitIdFor } from '@/lib/ids';
import type { FileKind } from '@/lib/import/file-reader';

export interface CreateTaskInput {
  fileName: string;
  fileRef: string;
  fileType: FileKind;
  ruleId: string | null;
  totalRows: number;
}

export interface CreatedTask {
  taskId: string;
  traceId: string;
  status: string;
  totalRows: number;
  totalBatches: number;
}

/**
 * Creates the import task, all batch rows and the transactional outbox events
 * in one database transaction. If this transaction commits, the task and its
 * events exist; if the process crashes before commit, nothing is visible.
 */
export async function createImportTask(input: CreateTaskInput): Promise<CreatedTask> {
  const taskId = newTaskId();
  const traceId = newTraceId();
  const totalBatches = Math.max(1, Math.ceil(input.totalRows / config.batchSize));

  await db.transaction(async (tx) => {
    await tx.insert(importTasks).values({
      id: taskId,
      traceId,
      fileName: input.fileName,
      fileRef: input.fileRef,
      fileType: input.fileType,
      ruleId: input.ruleId,
      status: 'pending',
      totalRows: input.totalRows,
      totalBatches,
    });

    const batchValues: (typeof importTaskBatches.$inferInsert)[] = [];
    const outboxValues: (typeof eventOutbox.$inferInsert)[] = [];

    for (let i = 0; i < totalBatches; i++) {
      const batchIndex = i + 1;
      const unitId = unitIdFor(batchIndex);
      const startRow = i * config.batchSize + 1;
      const endRow = Math.min(input.totalRows, (i + 1) * config.batchSize);

      batchValues.push({
        taskId,
        unitId,
        batchIndex,
        startRow,
        endRow,
        status: 'pending',
      });

      outboxValues.push({
        eventId: newEventId(),
        eventType: 'ImportBatchCreated',
        schemaVersion: 1,
        aggregateId: taskId,
        traceId,
        payload: {
          taskId,
          unitId,
          batchIndex,
          startRow,
          endRow,
          traceId,
          fileRef: input.fileRef,
          fileType: input.fileType,
          ruleId: input.ruleId,
        },
        status: 'pending',
      });
    }

    if (batchValues.length > 0) {
      await tx.insert(importTaskBatches).values(batchValues);
    }
    if (outboxValues.length > 0) {
      await tx.insert(eventOutbox).values(outboxValues);
    }

    await tx.insert(traceEvents).values({
      traceId,
      taskId,
      eventName: 'ImportTaskCreated',
      eventStatus: 'info',
      message: `任务已创建：${input.totalRows} 行，${totalBatches} 个处理单元`,
    });
  });

  return {
    taskId,
    traceId,
    status: 'pending',
    totalRows: input.totalRows,
    totalBatches,
  };
}

export async function markTaskProcessing(taskId: string): Promise<void> {
  await db.execute(sql`
    UPDATE import_tasks
    SET status = 'processing', updated_at = now()
    WHERE id = ${taskId} AND status IN ('pending')
  `);
}
