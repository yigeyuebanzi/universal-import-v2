import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTasks } from '@/lib/db/schema';
import { checkApiKey } from '@/lib/auth';
import { getImportQueue } from '@/lib/queue';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = checkApiKey(request);
  if (authError) return authError;

  try {
    const [throughputRows, backlogRows, stageRows, errorRows, slowRows, trendRows, recentTasks] =
      await Promise.all([
        db.execute(sql`
          SELECT to_char(date_trunc('minute', completed_at), 'HH24:MI') AS minute,
                 sum(success_rows)::int AS rows
          FROM import_task_batches
          WHERE completed_at >= now() - interval '5 minutes'
          GROUP BY 1 ORDER BY 1
        `),
        db.execute(sql`
          SELECT
            (SELECT count(*)::int FROM import_task_batches WHERE status IN ('pending','retry')) AS pending_batches,
            (SELECT count(*)::int FROM import_task_batches WHERE status = 'processing') AS processing_batches,
            (SELECT count(*)::int FROM event_outbox WHERE status IN ('pending','failed') AND (next_retry_at IS NULL OR next_retry_at <= now())) AS pending_events,
            (SELECT count(*)::int FROM import_tasks WHERE status = 'failed' AND completed_at >= now() - interval '5 minutes') AS failed_tasks_5m
        `),
        db.execute(sql`
          SELECT stage, round(p50::numeric,1) AS p50, round(p95::numeric,1) AS p95, round(p99::numeric,1) AS p99
          FROM (
            SELECT 'parse' AS stage,
                   percentile_cont(0.50) within group (order by parse_duration_ms) AS p50,
                   percentile_cont(0.95) within group (order by parse_duration_ms) AS p95,
                   percentile_cont(0.99) within group (order by parse_duration_ms) AS p99
            FROM batch_performance_log WHERE created_at >= now() - interval '24 hours'
            UNION ALL
            SELECT 'rule', percentile_cont(0.50) within group (order by rule_duration_ms),
                   percentile_cont(0.95) within group (order by rule_duration_ms),
                   percentile_cont(0.99) within group (order by rule_duration_ms)
            FROM batch_performance_log WHERE created_at >= now() - interval '24 hours'
            UNION ALL
            SELECT 'validate', percentile_cont(0.50) within group (order by validate_duration_ms),
                   percentile_cont(0.95) within group (order by validate_duration_ms),
                   percentile_cont(0.99) within group (order by validate_duration_ms)
            FROM batch_performance_log WHERE created_at >= now() - interval '24 hours'
            UNION ALL
            SELECT 'insert', percentile_cont(0.50) within group (order by insert_duration_ms),
                   percentile_cont(0.95) within group (order by insert_duration_ms),
                   percentile_cont(0.99) within group (order by insert_duration_ms)
            FROM batch_performance_log WHERE created_at >= now() - interval '24 hours'
            UNION ALL
            SELECT 'total', percentile_cont(0.50) within group (order by total_duration_ms),
                   percentile_cont(0.95) within group (order by total_duration_ms),
                   percentile_cont(0.99) within group (order by total_duration_ms)
            FROM batch_performance_log WHERE created_at >= now() - interval '24 hours'
          ) s
        `),
        db.execute(sql`
          SELECT error_code, count(*)::int AS cnt
          FROM import_task_errors
          WHERE created_at >= now() - interval '24 hours'
          GROUP BY error_code ORDER BY cnt DESC
        `),
        db.execute(sql`
          SELECT task_id, unit_id, total_duration_ms, validate_duration_ms, insert_duration_ms, trace_id, created_at
          FROM batch_performance_log
          WHERE created_at >= now() - interval '24 hours'
          ORDER BY total_duration_ms DESC LIMIT 10
        `),
        db.execute(sql`
          SELECT to_char(date_trunc('hour', completed_at), 'MM-DD HH24') AS hour,
                 count(*) FILTER (WHERE status = 'failed')::int AS failed,
                 count(*) FILTER (WHERE status = 'partial_success')::int AS partial
          FROM import_tasks
          WHERE completed_at >= now() - interval '24 hours'
          GROUP BY 1 ORDER BY 1
        `),
        db
          .select({
            id: importTasks.id,
            fileName: importTasks.fileName,
            status: importTasks.status,
            totalRows: importTasks.totalRows,
            processedRows: importTasks.processedRows,
            failedRows: importTasks.failedRows,
            degraded: importTasks.degraded,
            createdAt: importTasks.createdAt,
          })
          .from(importTasks)
          .orderBy(sql`${importTasks.createdAt} DESC`)
          .limit(10),
      ]);

    let redis: { waiting: number; active: number; failed: number; delayed: number } | null = null;
    let redisError: string | null = null;
    try {
      const counts = await getImportQueue().getJobCounts('waiting', 'active', 'delayed', 'failed');
      redis = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    } catch (err) {
      redisError = err instanceof Error ? err.message : String(err);
    }

    const backlog = backlogRows[0] as Record<string, number> | undefined;
    const pendingRows = (backlog?.pending_batches ?? 0) * config.batchSize;
    const alerts: { level: 'warning' | 'critical' | 'info'; message: string }[] = [];
    if (pendingRows > 5000) {
      alerts.push({ level: 'warning', message: `队列积压超过阈值：约 ${pendingRows} 行待处理` });
    }
    if (redisError) {
      alerts.push({ level: 'critical', message: `Redis 队列不可用：${redisError}` });
    }
    if ((backlog?.failed_tasks_5m ?? 0) > 0) {
      alerts.push({ level: 'warning', message: `近 5 分钟有 ${backlog?.failed_tasks_5m} 个失败任务` });
    }

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      throughput: throughputRows,
      backlog: {
        pending_batches: backlog?.pending_batches ?? 0,
        pending_events: backlog?.pending_events ?? 0,
        processing_batches: backlog?.processing_batches ?? 0,
        estimated_pending_rows: pendingRows,
        threshold_rows: 5000,
      },
      redis,
      redis_error: redisError,
      stages: stageRows,
      error_distribution: errorRows,
      slow_batches_top10: slowRows,
      task_trend: trendRows,
      recent_tasks: recentTasks,
      alerts,
    });
  } catch (err) {
    console.error('[monitor] summary failed', err);
    return NextResponse.json(
      { error: `监控聚合失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
