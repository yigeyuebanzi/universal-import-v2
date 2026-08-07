import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ============================================================
// V2 legacy tables (kept intact for compatibility)
// ============================================================

export const parseRules = pgTable('parse_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  fileType: varchar('file_type', { length: 20 }).notNull(),
  ruleConfig: jsonb('rule_config').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileName: varchar('file_name', { length: 255 }),
  ruleId: uuid('rule_id').references(() => parseRules.id),
  totalCount: integer('total_count').default(0),
  successCount: integer('success_count').default(0),
  failCount: integer('fail_count').default(0),
  status: varchar('status', { length: 20 }).default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalCode: varchar('external_code', { length: 255 }),
  storeName: varchar('store_name', { length: 255 }),
  receiverName: varchar('receiver_name', { length: 100 }),
  receiverPhone: varchar('receiver_phone', { length: 50 }),
  receiverAddress: text('receiver_address'),
  remark: text('remark'),
  batchId: uuid('batch_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_orders_external_code').on(table.externalCode),
  index('idx_orders_batch_id').on(table.batchId),
]);

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  skuCode: varchar('sku_code', { length: 255 }).notNull(),
  skuName: varchar('sku_name', { length: 255 }).notNull(),
  skuQuantity: decimal('sku_quantity').notNull(),
  skuSpec: varchar('sku_spec', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// V4 async pipeline tables
// ============================================================

export const skuMaster = pgTable('sku_master', {
  id: uuid('id').primaryKey().defaultRandom(),
  skuCode: varchar('sku_code', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  spec: varchar('spec', { length: 255 }),
  unit: varchar('unit', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('uk_sku_master_sku_code').on(table.skuCode),
]);

export const importTasks = pgTable('import_tasks', {
  id: varchar('id', { length: 64 }).primaryKey(),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileRef: text('file_ref').notNull(),
  fileType: varchar('file_type', { length: 20 }).notNull(),
  ruleId: uuid('rule_id').references(() => parseRules.id),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  totalRows: integer('total_rows').notNull().default(0),
  processedRows: integer('processed_rows').notNull().default(0),
  successRows: integer('success_rows').notNull().default(0),
  failedRows: integer('failed_rows').notNull().default(0),
  degradedRows: integer('degraded_rows').notNull().default(0),
  totalBatches: integer('total_batches').notNull().default(0),
  completedBatches: integer('completed_batches').notNull().default(0),
  degraded: boolean('degraded').notNull().default(false),
  degradedAt: timestamp('degraded_at', { withTimezone: true }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_import_tasks_status_created').on(table.status, table.createdAt),
  index('idx_import_tasks_trace').on(table.traceId),
  index('idx_import_tasks_file_name').on(table.fileName),
]);

export const importTaskBatches = pgTable('import_task_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: varchar('task_id', { length: 64 }).notNull().references(() => importTasks.id, { onDelete: 'cascade' }),
  unitId: varchar('unit_id', { length: 64 }).notNull(),
  batchIndex: integer('batch_index').notNull(),
  startRow: integer('start_row').notNull(),
  endRow: integer('end_row').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  retryCount: integer('retry_count').notNull().default(0),
  successRows: integer('success_rows').notNull().default(0),
  failedRows: integer('failed_rows').notNull().default(0),
  skuValidationSkipped: boolean('sku_validation_skipped').notNull().default(false),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  lastError: text('last_error'),
}, (table) => [
  uniqueIndex('uk_import_task_batches_task_unit').on(table.taskId, table.unitId),
  index('idx_import_task_batches_task_status').on(table.taskId, table.status),
  index('idx_import_task_batches_status_locked').on(table.status, table.lockedAt),
]);

export const importTaskErrors = pgTable('import_task_errors', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: varchar('task_id', { length: 64 }).notNull().references(() => importTasks.id, { onDelete: 'cascade' }),
  unitId: varchar('unit_id', { length: 64 }).notNull(),
  batchIndex: integer('batch_index').notNull(),
  rowNumber: integer('row_number').notNull(),
  fieldName: varchar('field_name', { length: 100 }),
  rawValue: text('raw_value'),
  errorCode: varchar('error_code', { length: 20 }).notNull(),
  errorReason: text('error_reason').notNull(),
  ruleName: varchar('rule_name', { length: 255 }),
  retried: boolean('retried').notNull().default(false),
  suggestion: text('suggestion'),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_import_task_errors_task_unit').on(table.taskId, table.unitId),
  index('idx_import_task_errors_error_code').on(table.errorCode),
  index('idx_import_task_errors_task_row').on(table.taskId, table.rowNumber),
  index('idx_import_task_errors_created').on(table.createdAt),
]);

export const eventOutbox = pgTable('event_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: varchar('event_id', { length: 64 }).notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  aggregateId: varchar('aggregate_id', { length: 64 }).notNull(),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  retryCount: integer('retry_count').notNull().default(0),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('uk_event_outbox_event_id').on(table.eventId),
  index('idx_event_outbox_status_retry').on(table.status, table.nextRetryAt),
  index('idx_event_outbox_aggregate').on(table.aggregateId),
]);

export const batchPerformanceLog = pgTable('batch_performance_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: varchar('task_id', { length: 64 }).notNull().references(() => importTasks.id, { onDelete: 'cascade' }),
  unitId: varchar('unit_id', { length: 64 }).notNull(),
  batchIndex: integer('batch_index').notNull(),
  rowCount: integer('row_count').notNull().default(0),
  parseDurationMs: integer('parse_duration_ms').notNull().default(0),
  ruleDurationMs: integer('rule_duration_ms').notNull().default(0),
  validateDurationMs: integer('validate_duration_ms').notNull().default(0),
  insertDurationMs: integer('insert_duration_ms').notNull().default(0),
  totalDurationMs: integer('total_duration_ms').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull(),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_batch_perf_task_unit').on(table.taskId, table.unitId),
  index('idx_batch_perf_created').on(table.createdAt),
]);

export const traceEvents = pgTable('trace_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  taskId: varchar('task_id', { length: 64 }),
  unitId: varchar('unit_id', { length: 64 }),
  eventName: varchar('event_name', { length: 64 }).notNull(),
  eventStatus: varchar('event_status', { length: 20 }).notNull().default('info'),
  message: text('message'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_trace_events_trace_time').on(table.traceId, table.occurredAt),
  index('idx_trace_events_task').on(table.taskId),
  index('idx_trace_events_unit').on(table.unitId),
]);

export const waybills = pgTable('waybills', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: varchar('task_id', { length: 64 }).references(() => importTasks.id),
  batchId: uuid('batch_id').references(() => importTaskBatches.id),
  externalOrderNo: varchar('external_order_no', { length: 255 }).notNull(),
  skuCode: varchar('sku_code', { length: 64 }).notNull(),
  lineNo: integer('line_no').notNull().default(1),
  storeName: varchar('store_name', { length: 255 }),
  receiverName: varchar('receiver_name', { length: 100 }),
  receiverPhone: varchar('receiver_phone', { length: 50 }),
  receiverAddress: text('receiver_address'),
  remark: text('remark'),
  skuName: varchar('sku_name', { length: 255 }),
  skuQuantity: decimal('sku_quantity'),
  skuSpec: varchar('sku_spec', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('uk_waybills_business_key').on(
    table.externalOrderNo,
    table.skuCode,
    table.lineNo
  ),
  index('idx_waybills_external_order_no').on(table.externalOrderNo),
  index('idx_waybills_task_id').on(table.taskId),
]);

export type ImportTask = typeof importTasks.$inferSelect;
export type ImportTaskBatch = typeof importTaskBatches.$inferSelect;
export type ImportTaskError = typeof importTaskErrors.$inferSelect;
export type OutboxEvent = typeof eventOutbox.$inferSelect;
export type Waybill = typeof waybills.$inferSelect;
