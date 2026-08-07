import { and, eq, inArray, sql } from 'drizzle-orm';
import { performance } from 'node:perf_hooks';
import { db } from '@/lib/db';
import {
  batchPerformanceLog,
  importTaskBatches,
  importTaskErrors,
  importTasks,
  parseRules,
  waybills,
} from '@/lib/db/schema';
import { config } from '@/lib/config';
import { RuleEngine } from '@/lib/rules/engine';
import type { ParseRule, ParsedRecord } from '@/lib/rules/types';
import { readBatchSource } from '@/lib/import/file-reader';
import { validateBatch } from '@/lib/import/validator';
import { finalizeTaskIfNeeded } from '@/lib/import/aggregator';
import { markTaskProcessing } from '@/lib/import/task-service';
import { writeTrace } from '@/lib/trace';
import { ERROR_CODES, suggestionFor } from '@/lib/errors';
import type { BatchJobPayload } from '@/lib/queue';

const engine = new RuleEngine();

async function loadRule(ruleId: string | null): Promise<ParseRule | null> {
  if (!ruleId) return null;
  const rows = await db.select().from(parseRules).where(eq(parseRules.id, ruleId)).limit(1);
  if (!rows[0]) return null;
  return rows[0].ruleConfig as unknown as ParseRule;
}

function prepareRecords(
  records: ParsedRecord[],
  fileType: string,
  startRow: number,
  endRow: number,
  dataStartRow: number
): ParsedRecord[] {
  if (fileType === 'excel') {
    const fileStart = dataStartRow + startRow - 1;
    const fileEnd = dataStartRow + endRow - 1;
    return records
      .filter((r) => r._rowIndex !== undefined && r._rowIndex >= fileStart && r._rowIndex <= fileEnd)
      .map((r) => ({ ...r }));
  }
  // Word/PDF: engine returns records in order; global row = record order.
  return records.slice(startRow - 1, endRow).map((r, idx) => ({ ...r, _rowIndex: startRow + idx }));
}

export async function processBatchJob(payload: BatchJobPayload): Promise<void> {
  const { taskId, unitId, batchIndex, startRow, endRow, traceId, fileRef, fileType, ruleId } = payload;

  await writeTrace({
    traceId,
    taskId,
    unitId,
    eventName: 'ImportBatchStarted',
    eventStatus: 'info',
    message: `处理单元 ${unitId} 开始（行 ${startRow}-${endRow}）`,
  });

  // Idempotent claim: only one execution per task+unit ever wins.
  const claimed = await db
    .update(importTaskBatches)
    .set({ status: 'processing', lockedAt: new Date(), startedAt: new Date() })
    .where(
      and(
        eq(importTaskBatches.taskId, taskId),
        eq(importTaskBatches.unitId, unitId),
        inArray(importTaskBatches.status, ['pending', 'retry'])
      )
    )
    .returning();

  if (claimed.length === 0) {
    await writeTrace({
      traceId,
      taskId,
      unitId,
      eventName: 'ImportBatchSucceeded',
      eventStatus: 'success',
      message: `${unitId} 重复消费，批次已完成，跳过`,
    });
    return;
  }

  const batch = claimed[0];
  await markTaskProcessing(taskId);

  const totalStart = performance.now();
  try {
    const rule = await loadRule(ruleId);
    if (!rule) {
      throw new Error(`解析规则不存在或未配置：ruleId=${ruleId ?? 'null'}`);
    }

    const parseStart = performance.now();
    const { rawData } = await readBatchSource(fileRef, fileType, rule, startRow, endRow);
    const parseDurationMs = Math.round(performance.now() - parseStart);

    const ruleStart = performance.now();
    const result = engine.parse(rawData, rule);
    const ruleDurationMs = Math.round(performance.now() - ruleStart);

    if (!result.success && result.data.length === 0) {
      throw new Error(`规则引擎失败：${(result.errors ?? []).join('; ')}`);
    }

    const dataStartRow = rule.dataRegion?.dataStartRow ?? (rule.dataRegion?.headerRow ?? 1) + 1;
    const records = prepareRecords(result.data, fileType, startRow, endRow, dataStartRow);
    if (records.length === 0) {
      const insertStart = performance.now();
      await db
        .update(importTaskBatches)
        .set({
          status: 'completed',
          successRows: 0,
          failedRows: 0,
          completedAt: new Date(),
          lockedAt: null,
        })
        .where(eq(importTaskBatches.id, batch.id));
      await db.execute(sql`
        UPDATE import_tasks
        SET processed_rows = processed_rows + ${endRow - startRow + 1},
            completed_batches = completed_batches + 1,
            updated_at = now()
        WHERE id = ${taskId}
      `);
      const insertDurationMs = Math.round(performance.now() - insertStart);
      const totalDurationMs = Math.round(performance.now() - totalStart);
      await db.insert(batchPerformanceLog).values({
        taskId,
        unitId,
        batchIndex,
        rowCount: 0,
        parseDurationMs,
        ruleDurationMs,
        validateDurationMs: 0,
        insertDurationMs,
        totalDurationMs,
        status: 'completed',
        traceId,
      });
      await writeTrace({
        traceId,
        taskId,
        unitId,
        eventName: 'ImportBatchSucceeded',
        eventStatus: 'success',
        message: `${unitId} 无有效数据，完成`,
      });
      await finalizeTaskIfNeeded(taskId, traceId);
      return;
    }

    const task = await db
      .select({ id: importTasks.id, degraded: importTasks.degraded, traceId: importTasks.traceId })
      .from(importTasks)
      .where(eq(importTasks.id, taskId))
      .limit(1);
    if (!task[0]) throw new Error(`任务不存在：${taskId}`);

    const validateStart = performance.now();
    const outcome = await validateBatch(records, task[0], rule.name ?? ruleId ?? '');
    const validateDurationMs = Math.round(performance.now() - validateStart);

    const insertStart = performance.now();

    if (outcome.errors.length > 0) {
      const errorValues = outcome.errors.map((e) => ({
        taskId,
        unitId,
        batchIndex,
        rowNumber: e.rowNumber,
        fieldName: e.fieldName,
        rawValue: e.rawValue,
        errorCode: e.errorCode,
        errorReason: e.errorReason,
        ruleName: rule.name ?? null,
        traceId,
        suggestion: e.suggestion ?? suggestionFor(e.errorCode),
      }));
      await db.insert(importTaskErrors).values(errorValues);
    }

    let insertedCount = 0;
    if (outcome.rows.length > 0) {
      const waybillValues = outcome.rows.map((r) => ({
        taskId,
        batchId: batch.id,
        externalOrderNo: r.externalOrderNo,
        skuCode: r.skuCode,
        lineNo: r.lineNo,
        storeName: r.storeName,
        receiverName: r.receiverName,
        receiverPhone: r.receiverPhone,
        receiverAddress: r.receiverAddress,
        remark: r.remark,
        skuName: r.skuName,
        skuQuantity: r.skuQuantity,
        skuSpec: r.skuSpec,
        updatedAt: new Date(),
      }));
      await db
        .insert(waybills)
        .values(waybillValues)
        .onConflictDoUpdate({
          target: [waybills.externalOrderNo, waybills.skuCode, waybills.lineNo],
          set: {
            storeName: sql`excluded.store_name`,
            receiverName: sql`excluded.receiver_name`,
            receiverPhone: sql`excluded.receiver_phone`,
            receiverAddress: sql`excluded.receiver_address`,
            remark: sql`excluded.remark`,
            skuName: sql`excluded.sku_name`,
            skuQuantity: sql`excluded.sku_quantity`,
            skuSpec: sql`excluded.sku_spec`,
            taskId,
            batchId: batch.id,
            updatedAt: new Date(),
          },
        });
      insertedCount = outcome.rows.length;
    }

    await db
      .update(importTaskBatches)
      .set({
        status: 'completed',
        successRows: insertedCount,
        failedRows: outcome.errors.length,
        skuValidationSkipped: outcome.skuValidationSkipped,
        completedAt: new Date(),
        lockedAt: null,
        lastError: null,
      })
      .where(eq(importTaskBatches.id, batch.id));

    await db.execute(sql`
      UPDATE import_tasks
      SET processed_rows = processed_rows + ${records.length},
          success_rows = success_rows + ${insertedCount},
          failed_rows = failed_rows + ${outcome.errors.length},
          degraded_rows = degraded_rows + ${outcome.skuValidationSkipped ? records.length : 0},
          completed_batches = completed_batches + 1,
          updated_at = now()
      WHERE id = ${taskId}
    `);

    const insertDurationMs = Math.round(performance.now() - insertStart);
    const totalDurationMs = Math.round(performance.now() - totalStart);

    await db.insert(batchPerformanceLog).values({
      taskId,
      unitId,
      batchIndex,
      rowCount: records.length,
      parseDurationMs,
      ruleDurationMs,
      validateDurationMs,
      insertDurationMs,
      totalDurationMs,
      status: 'completed',
      traceId,
    });

    if (outcome.skuValidationSkipped) {
      await db
        .update(importTasks)
        .set({ degraded: true, degradedAt: new Date(), updatedAt: new Date() })
        .where(eq(importTasks.id, taskId));
      await writeTrace({
        traceId,
        taskId,
        unitId,
        eventName: 'ImportTaskDegraded',
        eventStatus: 'warning',
        message: 'SKU 主数据校验超时，已进入降级模式，本批次跳过 SKU 校验',
      });
    }

    await writeTrace({
      traceId,
      taskId,
      unitId,
      eventName: 'ImportBatchSucceeded',
      eventStatus: 'success',
      message: `${unitId} 完成：成功 ${insertedCount} 行，失败 ${outcome.errors.length} 行，总耗时 ${totalDurationMs}ms`,
    });

    await finalizeTaskIfNeeded(taskId, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryCount = batch.retryCount + 1;
    const nextStatus = retryCount >= config.batchMaxRetries ? 'failed' : 'retry';

    await db
      .update(importTaskBatches)
      .set({
        status: nextStatus,
        retryCount,
        lockedAt: null,
        completedAt: nextStatus === 'failed' ? new Date() : null,
        lastError: message,
      })
      .where(eq(importTaskBatches.id, batch.id));

    if (nextStatus === 'failed') {
      await db
        .update(importTasks)
        .set({ error: message, updatedAt: new Date() })
        .where(eq(importTasks.id, taskId));
    }

    await writeTrace({
      traceId,
      taskId,
      unitId,
      eventName: 'ImportBatchFailed',
      eventStatus: 'error',
      message: `${unitId} 失败（重试 ${retryCount}/${config.batchMaxRetries}）：${message}`,
    });

    await finalizeTaskIfNeeded(taskId, traceId);
    throw err;
  }
}

// E007 is still defined for API-level DB write failures (kept for error taxonomy).
export const DB_WRITE_ERROR_CODE = ERROR_CODES.DB_WRITE;
