import { pgTable, uuid, varchar, text, timestamp, decimal, integer, jsonb, index } from 'drizzle-orm/pg-core';

// 解析规则表
export const parseRules = pgTable('parse_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  fileType: varchar('file_type', { length: 20 }).notNull(),
  ruleConfig: jsonb('rule_config').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 导入批次表
export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileName: varchar('file_name', { length: 255 }),
  ruleId: uuid('rule_id').references(() => parseRules.id),
  totalCount: integer('total_count').default(0),
  successCount: integer('success_count').default(0),
  failCount: integer('fail_count').default(0),
  status: varchar('status', { length: 20 }).default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 运单主表
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalCode: varchar('external_code', { length: 255 }),
  storeName: varchar('store_name', { length: 255 }),
  receiverName: varchar('receiver_name', { length: 100 }),
  receiverPhone: varchar('receiver_phone', { length: 50 }),
  receiverAddress: text('receiver_address'),
  remark: text('remark'),
  batchId: uuid('batch_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_orders_external_code').on(table.externalCode),
  index('idx_orders_batch_id').on(table.batchId),
  index('idx_orders_receiver_name').on(table.receiverName),
  index('idx_orders_created_at').on(table.createdAt),
]);

// SKU明细表
export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  skuCode: varchar('sku_code', { length: 255 }).notNull(),
  skuName: varchar('sku_name', { length: 255 }).notNull(),
  skuQuantity: decimal('sku_quantity').notNull(),
  skuSpec: varchar('sku_spec', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
});
