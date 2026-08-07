CREATE TABLE "batch_performance_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"unit_id" varchar(64) NOT NULL,
	"batch_index" integer NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"parse_duration_ms" integer DEFAULT 0 NOT NULL,
	"rule_duration_ms" integer DEFAULT 0 NOT NULL,
	"validate_duration_ms" integer DEFAULT 0 NOT NULL,
	"insert_duration_ms" integer DEFAULT 0 NOT NULL,
	"total_duration_ms" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) NOT NULL,
	"trace_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(64) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"aggregate_id" varchar(64) NOT NULL,
	"trace_id" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" varchar(255),
	"rule_id" uuid,
	"total_count" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"fail_count" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "import_task_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"unit_id" varchar(64) NOT NULL,
	"batch_index" integer NOT NULL,
	"start_row" integer NOT NULL,
	"end_row" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"success_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"sku_validation_skipped" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "import_task_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"unit_id" varchar(64) NOT NULL,
	"batch_index" integer NOT NULL,
	"row_number" integer NOT NULL,
	"field_name" varchar(100),
	"raw_value" text,
	"error_code" varchar(20) NOT NULL,
	"error_reason" text NOT NULL,
	"rule_name" varchar(255),
	"retried" boolean DEFAULT false NOT NULL,
	"suggestion" text,
	"trace_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "import_tasks" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"trace_id" varchar(64) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_ref" text NOT NULL,
	"file_type" varchar(20) NOT NULL,
	"rule_id" uuid,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"success_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"degraded_rows" integer DEFAULT 0 NOT NULL,
	"total_batches" integer DEFAULT 0 NOT NULL,
	"completed_batches" integer DEFAULT 0 NOT NULL,
	"degraded" boolean DEFAULT false NOT NULL,
	"degraded_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"sku_code" varchar(255) NOT NULL,
	"sku_name" varchar(255) NOT NULL,
	"sku_quantity" numeric NOT NULL,
	"sku_spec" varchar(255),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_code" varchar(255),
	"store_name" varchar(255),
	"receiver_name" varchar(100),
	"receiver_phone" varchar(50),
	"receiver_address" text,
	"remark" text,
	"batch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parse_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"file_type" varchar(20) NOT NULL,
	"rule_config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sku_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"spec" varchar(255),
	"unit" varchar(50),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trace_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar(64) NOT NULL,
	"task_id" varchar(64),
	"unit_id" varchar(64),
	"event_name" varchar(64) NOT NULL,
	"event_status" varchar(20) DEFAULT 'info' NOT NULL,
	"message" text,
	"occurred_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "waybills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(64),
	"batch_id" uuid,
	"external_order_no" varchar(255) NOT NULL,
	"sku_code" varchar(64) NOT NULL,
	"line_no" integer DEFAULT 1 NOT NULL,
	"store_name" varchar(255),
	"receiver_name" varchar(100),
	"receiver_phone" varchar(50),
	"receiver_address" text,
	"remark" text,
	"sku_name" varchar(255),
	"sku_quantity" numeric,
	"sku_spec" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "batch_performance_log" ADD CONSTRAINT "batch_performance_log_task_id_import_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."import_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_rule_id_parse_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."parse_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_task_batches" ADD CONSTRAINT "import_task_batches_task_id_import_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."import_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_task_errors" ADD CONSTRAINT "import_task_errors_task_id_import_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."import_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_tasks" ADD CONSTRAINT "import_tasks_rule_id_parse_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."parse_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_task_id_import_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."import_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_batch_id_import_task_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_task_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_batch_perf_task_unit" ON "batch_performance_log" USING btree ("task_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_batch_perf_created" ON "batch_performance_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_event_outbox_event_id" ON "event_outbox" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_event_outbox_status_retry" ON "event_outbox" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_event_outbox_aggregate" ON "event_outbox" USING btree ("aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_import_task_batches_task_unit" ON "import_task_batches" USING btree ("task_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_import_task_batches_task_status" ON "import_task_batches" USING btree ("task_id","status");--> statement-breakpoint
CREATE INDEX "idx_import_task_batches_status_locked" ON "import_task_batches" USING btree ("status","locked_at");--> statement-breakpoint
CREATE INDEX "idx_import_task_errors_task_unit" ON "import_task_errors" USING btree ("task_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_import_task_errors_error_code" ON "import_task_errors" USING btree ("error_code");--> statement-breakpoint
CREATE INDEX "idx_import_task_errors_task_row" ON "import_task_errors" USING btree ("task_id","row_number");--> statement-breakpoint
CREATE INDEX "idx_import_task_errors_created" ON "import_task_errors" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_import_tasks_status_created" ON "import_tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_import_tasks_trace" ON "import_tasks" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "idx_import_tasks_file_name" ON "import_tasks" USING btree ("file_name");--> statement-breakpoint
CREATE INDEX "idx_orders_external_code" ON "orders" USING btree ("external_code");--> statement-breakpoint
CREATE INDEX "idx_orders_batch_id" ON "orders" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_sku_master_sku_code" ON "sku_master" USING btree ("sku_code");--> statement-breakpoint
CREATE INDEX "idx_trace_events_trace_time" ON "trace_events" USING btree ("trace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_trace_events_task" ON "trace_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_trace_events_unit" ON "trace_events" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_waybills_business_key" ON "waybills" USING btree ("external_order_no","sku_code","line_no");--> statement-breakpoint
CREATE INDEX "idx_waybills_external_order_no" ON "waybills" USING btree ("external_order_no");--> statement-breakpoint
CREATE INDEX "idx_waybills_task_id" ON "waybills" USING btree ("task_id");