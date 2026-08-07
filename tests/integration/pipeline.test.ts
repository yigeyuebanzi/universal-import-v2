import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  batchPerformanceLog,
  eventOutbox,
  importTaskBatches,
  importTaskErrors,
  importTasks,
  parseRules,
  skuMaster,
  traceEvents,
  waybills,
} from '@/lib/db/schema';
import { createImportTask } from '@/lib/import/task-service';
import { dispatchPendingOutbox } from '@/lib/import/dispatcher';
import { processBatchJob } from '@/lib/import/worker';
import { finalizeTaskIfNeeded } from '@/lib/import/aggregator';
import { sweepStaleBatches, recoverLostOutboxEvents } from '@/lib/import/sweeper';
import type { BatchJobPayload } from '@/lib/queue';
import { POST as createTaskRoute } from '@/app/api/import-tasks/route';
import { GET as getTaskDetailRoute } from '@/app/api/import-tasks/[taskId]/route';

let testRuleId = '';
let testFileRef = '';

async function truncatePipelineTables(): Promise<void> {
  await db.execute(drizzleSql`
    TRUNCATE import_task_errors, batch_performance_log, trace_events, waybills,
             import_task_batches, import_tasks, event_outbox CASCADE
  `);
}

async function seedBaseData(): Promise<void> {
  await db
    .insert(skuMaster)
    .values([
      { skuCode: 'SKU_00001', name: '商品1', spec: '1kg', unit: '件' },
      { skuCode: 'SKU_00002', name: '商品2', spec: '2kg', unit: '件' },
    ])
    .onConflictDoNothing();

  await db.delete(parseRules).where(drizzleSql`name = '集成测试规则'`);
  const [rule] = await db
    .insert(parseRules)
    .values({
      name: '集成测试规则',
      fileType: 'excel',
      ruleConfig: {
        id: 'integration-rule',
        name: '集成测试规则',
        fileType: 'excel',
        source: { type: 'table', sheetConfig: { sheetIndex: 0 } },
        dataRegion: { headerRow: 1, dataStartRow: 2, dataEndRow: 'auto' },
        fieldMapping: {
          externalCode: { type: 'column', column: 0 },
          storeName: { type: 'column', column: 1 },
          receiverName: { type: 'column', column: 2 },
          receiverPhone: { type: 'column', column: 3 },
          receiverAddress: { type: 'column', column: 4 },
          skuCode: { type: 'column', column: 5 },
          skuName: { type: 'column', column: 6 },
          skuQuantity: { type: 'column', column: 7 },
          skuSpec: { type: 'column', column: 8 },
          remark: { type: 'column', column: 9 },
        },
        postProcessing: { trimWhitespace: true, removeEmptyRows: true },
      },
    })
    .returning({ id: parseRules.id });
  testRuleId = rule!.id;

  const dir = path.resolve(process.cwd(), 'data/uploads');
  await mkdir(dir, { recursive: true });
  testFileRef = path.join(dir, 'integration-test.xlsx');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('运单');
  ws.addRow(['外部单号', '门店名称', '收货人', '手机号', '收货地址', 'SKU编码', 'SKU名称', '数量', '规格', '备注']);
  ws.addRow(['ORDER_T1', '门店A', '张三', '13800000000', '地址1', 'SKU_00001', '商品1', 2, '1kg', '']);
  ws.addRow(['ORDER_T2', '门店A', '李四', '13800000000', '地址2', 'SKU_BAD', '坏商品', 2, '1kg', '']);
  ws.addRow(['ORDER_T3', '门店A', '王五', '123', '地址3', 'SKU_00001', '商品1', 2, '1kg', '']);
  ws.addRow(['ORDER_T4', '门店A', '赵六', '13800000000', '地址4', 'SKU_00001', '商品1', -1, '1kg', '']);
  ws.addRow(['ORDER_T5', '门店A', '钱七', '13800000000', '地址5', 'SKU_00001', '商品1', 2, '1kg', '']);
  await wb.xlsx.writeFile(testFileRef);
}

async function makeTask(): Promise<{ taskId: string; traceId: string; payload: BatchJobPayload }> {
  const created = await createImportTask({
    fileName: 'integration-test.xlsx',
    fileRef: testFileRef,
    fileType: 'excel',
    ruleId: testRuleId,
    totalRows: 5,
  });
  const outbox = await db
    .select({ payload: eventOutbox.payload })
    .from(eventOutbox)
    .where(drizzleSql`aggregate_id = ${created.taskId}`)
    .limit(1);
  return {
    taskId: created.taskId,
    traceId: created.traceId,
    payload: outbox[0]!.payload as unknown as BatchJobPayload,
  };
}

describe('async import pipeline (integration)', () => {
  beforeAll(async () => {
    await truncatePipelineTables();
    await seedBaseData();
  });

  beforeEach(async () => {
    await truncatePipelineTables();
  });

  it('creates task, batches and outbox events in one transaction', async () => {
    const created = await createImportTask({
      fileName: 'integration-test.xlsx',
      fileRef: testFileRef,
      fileType: 'excel',
      ruleId: testRuleId,
      totalRows: 5,
    });

    const taskCount = await db.select({ c: drizzleSql<number>`count(*)::int` }).from(importTasks);
    const batchCount = await db.select({ c: drizzleSql<number>`count(*)::int` }).from(importTaskBatches);
    const outboxCount = await db.select({ c: drizzleSql<number>`count(*)::int` }).from(eventOutbox);
    const traceCount = await db
      .select({ c: drizzleSql<number>`count(*)::int` })
      .from(traceEvents)
      .where(drizzleSql`task_id = ${created.taskId}`);

    expect(created.totalBatches).toBe(1);
    expect(Number(taskCount[0]?.c)).toBe(1);
    expect(Number(batchCount[0]?.c)).toBe(1);
    expect(Number(outboxCount[0]?.c)).toBe(1);
    expect(Number(traceCount[0]?.c)).toBe(1);
  });

  it('dispatcher enqueues outbox events and can re-dispatch recovered rows', async () => {
    const prev = process.env.QUEUE_DRIVER;
    process.env.QUEUE_DRIVER = 'redis';
    try {
      await makeTask();
      const dispatched: BatchJobPayload[] = [];
      await dispatchPendingOutbox(10, async (payload) => {
        dispatched.push(payload);
      });

      const outbox = await db.select().from(eventOutbox);
      expect(outbox.length).toBe(1);
      expect(outbox[0]!.status).toBe('sent');
      expect(dispatched.length).toBe(1);

      // Simulate a crash between enqueue and status update: dispatcher must retry.
      await db
        .update(eventOutbox)
        .set({ status: 'pending', sentAt: null, nextRetryAt: new Date(Date.now() - 1000) })
        .where(drizzleSql`id = ${outbox[0]!.id}`);
      const dispatched2: BatchJobPayload[] = [];
      await dispatchPendingOutbox(10, async (payload) => {
        dispatched2.push(payload);
      });
      const after = await db.select().from(eventOutbox);
      expect(after[0]!.status).toBe('sent');
      expect(dispatched2.length).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.QUEUE_DRIVER;
      else process.env.QUEUE_DRIVER = prev;
    }
  });

  it('worker processes a batch with partial failure and is idempotent on replay', async () => {
    const { taskId, traceId, payload } = await makeTask();
    await processBatchJob(payload);

    const batch = await db
      .select()
      .from(importTaskBatches)
      .where(drizzleSql`task_id = ${taskId}`)
      .limit(1);
    expect(batch[0]!.status).toBe('completed');
    expect(batch[0]!.successRows).toBe(2);
    expect(batch[0]!.failedRows).toBe(3);

    const waybillCount = await db
      .select({ c: drizzleSql<number>`count(*)::int` })
      .from(waybills)
      .where(drizzleSql`task_id = ${taskId}`);
    expect(Number(waybillCount[0]?.c)).toBe(2);

    const errors = await db
      .select({ code: importTaskErrors.errorCode })
      .from(importTaskErrors)
      .where(drizzleSql`task_id = ${taskId}`)
      .orderBy(importTaskErrors.rowNumber);
    expect(errors.map((e) => e.code).sort()).toEqual(['E001', 'E003', 'E004']);

    const perfCount = await db
      .select({ c: drizzleSql<number>`count(*)::int` })
      .from(batchPerformanceLog)
      .where(drizzleSql`task_id = ${taskId}`);
    expect(Number(perfCount[0]?.c)).toBe(1);

    const traceCount = await db
      .select({ c: drizzleSql<number>`count(*)::int` })
      .from(traceEvents)
      .where(drizzleSql`task_id = ${taskId}`);
    expect(Number(traceCount[0]?.c)).toBeGreaterThanOrEqual(3);

    // Replay the same job: no duplicate writes, no double progress.
    await processBatchJob(payload);
    const waybillCount2 = await db
      .select({ c: drizzleSql<number>`count(*)::int` })
      .from(waybills)
      .where(drizzleSql`task_id = ${taskId}`);
    const errorCount2 = await db
      .select({ c: drizzleSql<number>`count(*)::int` })
      .from(importTaskErrors)
      .where(drizzleSql`task_id = ${taskId}`);
    const task = await db.select().from(importTasks).where(drizzleSql`id = ${taskId}`).limit(1);
    expect(Number(waybillCount2[0]?.c)).toBe(2);
    expect(Number(errorCount2[0]?.c)).toBe(3);
    expect(task[0]!.processedRows).toBe(5);
    expect(task[0]!.successRows).toBe(2);
    expect(task[0]!.failedRows).toBe(3);

    await finalizeTaskIfNeeded(taskId, traceId);
    const afterFinalize = await db.select().from(importTasks).where(drizzleSql`id = ${taskId}`).limit(1);
    expect(afterFinalize[0]!.status).toBe('partial_success');
  });

  it('sweeper recovers stale batches and recreates lost outbox events', async () => {
    const { taskId, payload } = await makeTask();

    // Stale processing batch -> retry + new outbox event.
    await db
      .update(importTaskBatches)
      .set({
        status: 'processing',
        lockedAt: new Date(Date.now() - 60 * 60 * 1000),
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
      })
      .where(drizzleSql`task_id = ${taskId}`);
    const recovered = await sweepStaleBatches();
    expect(recovered).toBeGreaterThan(0);

    const batch = await db
      .select()
      .from(importTaskBatches)
      .where(drizzleSql`task_id = ${taskId}`)
      .limit(1);
    expect(batch[0]!.status).toBe('retry');
    expect(batch[0]!.retryCount).toBe(1);
    const pendingOutbox = await db
      .select({ c: drizzleSql<number>`count(*)::int` })
      .from(eventOutbox)
      .where(drizzleSql`status = 'pending'`);
    expect(Number(pendingOutbox[0]?.c)).toBeGreaterThanOrEqual(1);

    // Lost outbox events are recreated from pending batches.
    await db.delete(eventOutbox);
    const recreated = await recoverLostOutboxEvents();
    expect(recreated).toBeGreaterThan(0);
    const outboxCount = await db.select({ c: drizzleSql<number>`count(*)::int` }).from(eventOutbox);
    expect(Number(outboxCount[0]?.c)).toBeGreaterThan(0);
  });

  it('upload route returns task_id fast and protects invalid task ids', async () => {
    // Warm up the route (first call compiles the handler).
    const form = new FormData();
    const file = await import('node:fs/promises').then((fs) => fs.readFile(testFileRef));
    form.append(
      'file',
      new File([file], 'integration-test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'integration-test.xlsx'
    );
    form.append('ruleId', testRuleId);
    const warmReq = new Request('http://localhost/api/import-tasks', { method: 'POST', body: form });
    await createTaskRoute(warmReq);
    await truncatePipelineTables();

    const form2 = new FormData();
    const file2 = await import('node:fs/promises').then((fs) => fs.readFile(testFileRef));
    form2.append(
      'file',
      new File([file2], 'integration-test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'integration-test.xlsx'
    );
    form2.append('ruleId', testRuleId);
    const started = Date.now();
    const res = await createTaskRoute(new Request('http://localhost/api/import-tasks', { method: 'POST', body: form2 }));
    const elapsed = Date.now() - started;
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.task_id).toBeTruthy();
    expect(elapsed).toBeLessThan(1000);

    const badIdRes = await getTaskDetailRoute(
      new Request('http://localhost/api/import-tasks/bad'),
      { params: Promise.resolve({ taskId: 'bad' }) }
    );
    expect(badIdRes.status).toBe(404);
    const missingRes = await getTaskDetailRoute(
      new Request('http://localhost/api/import-tasks/task_missing123456'),
      { params: Promise.resolve({ taskId: 'task_missing123456' }) }
    );
    expect(missingRes.status).toBe(404);
  });
});
