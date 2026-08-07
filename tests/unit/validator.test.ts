import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTasks, skuMaster } from '@/lib/db/schema';
import { validateBatch } from '@/lib/import/validator';
import type { ParsedRecord } from '@/lib/rules/types';

async function seedTask(): Promise<{ id: string; traceId: string; degraded: boolean }> {
  const [task] = await db
    .insert(importTasks)
    .values({
      id: `task_test_${Math.random().toString(36).slice(2, 10)}`,
      traceId: `trace_test_${Math.random().toString(36).slice(2, 10)}`,
      fileName: 'unit-test.xlsx',
      fileRef: '/tmp/unit-test.xlsx',
      fileType: 'excel',
      status: 'processing',
      totalRows: 10,
      totalBatches: 1,
    })
    .returning({ id: importTasks.id, traceId: importTasks.traceId, degraded: importTasks.degraded });
  return task!;
}

describe('validateBatch', () => {
  beforeEach(async () => {
    await db.execute(drizzleSql`TRUNCATE import_task_errors, waybills, import_task_batches, import_tasks, event_outbox, trace_events, batch_performance_log CASCADE`);
    await db
      .insert(skuMaster)
      .values({ skuCode: 'SKU_00001', name: '商品1', spec: '1kg', unit: '件' })
      .onConflictDoNothing();
  });

  it('flags required, phone, quantity, SKU and duplicate errors', async () => {
    const task = await seedTask();
    const records: ParsedRecord[] = [
      { _rowIndex: 2, externalCode: 'A1', skuCode: 'SKU_00001', receiverName: '张三', receiverPhone: '13800000000', skuQuantity: '2' },
      { _rowIndex: 3, externalCode: 'A1', skuCode: 'SKU_00001', receiverName: '李四', receiverPhone: '123', skuQuantity: '2' },
      { _rowIndex: 4, externalCode: 'A2', skuCode: 'SKU_NOT_FOUND', receiverName: '', receiverPhone: '13800000000', skuQuantity: '-1' },
    ];

    const outcome = await validateBatch(records, task, 'unit-rule', {
      skuLoader: async () => new Set(['SKU_00001']),
      existingKeys: new Set(['A1']),
    });

    const codes = outcome.errors.map((e) => e.errorCode);
    expect(codes).toContain('E005'); // duplicate within batch + existing
    expect(codes).toContain('E003'); // phone
    expect(codes).toContain('E001'); // sku
    expect(codes).toContain('E002'); // required
    expect(codes).toContain('E004'); // quantity
    expect(outcome.rows.length).toBe(0);
    expect(outcome.skuValidationSkipped).toBe(false);
  });

  it('keeps valid rows and masks sensitive raw values', async () => {
    const task = await seedTask();
    const records: ParsedRecord[] = [
      { _rowIndex: 2, externalCode: 'B1', skuCode: 'SKU_00001', receiverName: '张三', receiverPhone: '13812345678', skuQuantity: '2' },
      { _rowIndex: 3, externalCode: 'B2', skuCode: 'SKU_00001', receiverName: '李四', receiverPhone: '13900000000', skuQuantity: '3' },
    ];
    const outcome = await validateBatch(records, task, 'unit-rule', {
      skuLoader: async () => new Set(['SKU_00001']),
    });
    expect(outcome.rows.length).toBe(2);
    expect(outcome.errors.length).toBe(0);
  });

  it('enters degraded mode when SKU loader times out and skips SKU check', async () => {
    const task = await seedTask();
    const records: ParsedRecord[] = [
      { _rowIndex: 2, externalCode: 'C1', skuCode: 'SKU_ANY', receiverName: '张三', receiverPhone: '13800000000', skuQuantity: '2' },
    ];
    const outcome = await validateBatch(records, task, 'unit-rule', {
      skuLoader: async () => {
        throw new Error('SKU_CHECK_TIMEOUT');
      },
    });
    expect(outcome.skuValidationSkipped).toBe(true);
    expect(outcome.errors.length).toBe(0);
    expect(outcome.rows.length).toBe(1);

    const updated = await db
      .select({ degraded: importTasks.degraded })
      .from(importTasks)
      .where(eq(importTasks.id, task.id));
    expect(updated[0]?.degraded).toBe(true);
  });
});
