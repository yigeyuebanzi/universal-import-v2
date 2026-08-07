import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { parseRules, skuMaster } from '@/lib/db/schema';
import { generateTestExcel } from './lib/generate-test-excel';

const SKU_COUNT = 20_000;
const LOAD_TEST_RULE_NAME = '压测-10000行运单';

async function cleanTestData(): Promise<void> {
  console.log('[seed] 清理压测数据...');
  await db.execute(sql`
    DELETE FROM import_task_errors
    WHERE task_id IN (SELECT id FROM import_tasks WHERE file_name LIKE '%10000-orders%')
  `);
  await db.execute(sql`
    DELETE FROM batch_performance_log
    WHERE task_id IN (SELECT id FROM import_tasks WHERE file_name LIKE '%10000-orders%')
  `);
  await db.execute(sql`
    DELETE FROM trace_events
    WHERE task_id IN (SELECT id FROM import_tasks WHERE file_name LIKE '%10000-orders%')
  `);
  await db.execute(sql`
    DELETE FROM waybills
    WHERE task_id IN (SELECT id FROM import_tasks WHERE file_name LIKE '%10000-orders%')
  `);
  await db.execute(sql`
    DELETE FROM import_task_batches
    WHERE task_id IN (SELECT id FROM import_tasks WHERE file_name LIKE '%10000-orders%')
  `);
  await db.execute(sql`
    DELETE FROM event_outbox
    WHERE aggregate_id IN (SELECT id FROM import_tasks WHERE file_name LIKE '%10000-orders%')
  `);
  await db.execute(sql`
    DELETE FROM import_tasks WHERE file_name LIKE '%10000-orders%'
  `);
  await db.delete(skuMaster).where(sql`sku_code LIKE 'SKU\\_%' ESCAPE '\\'`);
  console.log('[seed] 清理完成');
}

async function seedSkus(): Promise<void> {
  console.log(`[seed] 写入 ${SKU_COUNT} 条 SKU 主数据...`);
  const chunk = 1000;
  for (let start = 1; start <= SKU_COUNT; start += chunk) {
    const values = [];
    for (let i = start; i < Math.min(start + chunk, SKU_COUNT + 1); i++) {
      const code = `SKU_${String(i).padStart(5, '0')}`;
      values.push({
        skuCode: code,
        name: `压测商品${i}`,
        spec: `${1 + (i % 20)}kg`,
        unit: '件',
      });
    }
    await db.insert(skuMaster).values(values).onConflictDoNothing();
  }
  const count = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(skuMaster)
    .where(sql`sku_code LIKE 'SKU\\_%' ESCAPE '\\'`);
  console.log(`[seed] SKU 主数据当前数量：${count[0]?.c}`);
}

async function seedLoadTestRule(): Promise<string> {
  const existing = await db
    .select()
    .from(parseRules)
    .where(eq(parseRules.name, LOAD_TEST_RULE_NAME))
    .limit(1);

  const ruleConfig = {
    id: 'preset-load-test-10000',
    name: LOAD_TEST_RULE_NAME,
    description: '10,000 行压测运单的通用表格式解析规则',
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
  };

  if (existing[0]) {
    const [updated] = await db
      .update(parseRules)
      .set({ ruleConfig, description: ruleConfig.description, updatedAt: new Date() })
      .where(eq(parseRules.id, existing[0].id))
      .returning({ id: parseRules.id });
    console.log(`[seed] 压测规则已更新：${updated?.id}`);
    return updated!.id;
  }

  const [inserted] = await db
    .insert(parseRules)
    .values({
      name: LOAD_TEST_RULE_NAME,
      description: ruleConfig.description,
      fileType: 'excel',
      ruleConfig,
    })
    .returning({ id: parseRules.id });
  console.log(`[seed] 压测规则已创建：${inserted.id}`);
  return inserted.id;
}

async function main() {
  const clean = process.argv.includes('--clean');
  if (clean) await cleanTestData();
  await seedSkus();
  const ruleId = await seedLoadTestRule();
  const file = await generateTestExcel(10_000);
  console.log(`[seed] 压测文件：${file.filePath}（${file.rows} 行）`);
  console.log(`[seed] 压测规则 ID：${ruleId}`);
  console.log('[seed] 完成。运行 npm run worker 启动 Worker，再运行 npm run load-test 压测。');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] 失败', err);
  process.exit(1);
});
