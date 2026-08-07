'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

interface MonitorSummary {
  generated_at: string;
  throughput: { minute: string; rows: number }[];
  backlog: {
    pending_batches: number;
    pending_events: number;
    processing_batches: number;
    estimated_pending_rows: number;
    threshold_rows: number;
  };
  redis: { waiting: number; active: number; delayed: number; failed: number } | null;
  redis_error: string | null;
  stages: { stage: string; p50: string; p95: string; p99: string }[];
  error_distribution: { error_code: string; cnt: number }[];
  slow_batches_top10: {
    task_id: string;
    unit_id: string;
    total_duration_ms: number;
    validate_duration_ms: number;
    insert_duration_ms: number;
    created_at: string;
  }[];
  task_trend: { hour: string; failed: number; partial: number }[];
  alerts: { level: 'warning' | 'critical' | 'info'; message: string }[];
}

export default function MonitorPage() {
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    async function load() {
      const headers: Record<string, string> = {};
      const key = window.sessionStorage.getItem('import_api_key');
      if (key) headers['x-api-key'] = key;
      try {
        const res = await fetch('/api/import-monitor/summary', { headers, cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (!stopped) {
          setSummary(body);
          setError('');
        }
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    const timer = setInterval(load, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  if (error && !summary) {
    return <div className="text-red-500">监控数据加载失败：{error}</div>;
  }
  if (!summary) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> 加载监控数据...
      </div>
    );
  }

  const maxThroughput = Math.max(1, ...summary.throughput.map((t) => t.rows));
  const maxError = Math.max(1, ...summary.error_distribution.map((e) => e.cnt));
  const maxTotal = Math.max(
    1,
    ...summary.slow_batches_top10.map((b) => b.total_duration_ms ?? 0)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">导入监控看板</h1>
          <p className="text-gray-400 text-sm mt-1">
            更新于 {new Date(summary.generated_at).toLocaleTimeString()} · 每 3 秒刷新
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <RefreshCw className="w-3.5 h-3.5" /> 自动刷新
        </div>
      </div>

      {summary.alerts.length > 0 && (
        <div className="space-y-2">
          {summary.alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-xl p-3 text-sm ${
                a.level === 'critical'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-orange-50 text-orange-700 border border-orange-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              {a.message}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400">待处理批次</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{summary.backlog.pending_batches}</div>
          <div className="text-xs text-gray-400 mt-1">约 {summary.backlog.estimated_pending_rows.toLocaleString()} 行</div>
          {summary.backlog.estimated_pending_rows > summary.backlog.threshold_rows && (
            <div className="text-xs text-orange-600 mt-1">已超过 {summary.backlog.threshold_rows} 行阈值</div>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400">处理中批次</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{summary.backlog.processing_batches}</div>
          <div className="text-xs text-gray-400 mt-1">Worker 并发处理中</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400">Outbox 待投递</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{summary.backlog.pending_events}</div>
          <div className="text-xs text-gray-400 mt-1">本地可靠事件</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400">Redis 队列</div>
          {summary.redis ? (
            <>
              <div className="text-2xl font-bold text-gray-900 mt-1">{summary.redis.waiting}</div>
              <div className="text-xs text-gray-400 mt-1">
                active {summary.redis.active} · delayed {summary.redis.delayed} · failed {summary.redis.failed}
              </div>
            </>
          ) : (
            <div className="text-red-500 text-sm mt-2">队列不可用</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">近 5 分钟吞吐量（成功行/分钟）</h2>
          {summary.throughput.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">暂无数据</div>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {summary.throughput.map((t) => (
                <div key={t.minute} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] text-gray-400">{t.rows}</div>
                  <div
                    className="w-full rounded-t bg-brand"
                    style={{ height: `${Math.max(4, (t.rows / maxThroughput) * 110)}px` }}
                  />
                  <div className="text-[10px] text-gray-400">{t.minute}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">阶段耗时分布（近 24h，ms）</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-gray-400 text-xs">
              <tr>
                <th className="py-2">阶段</th>
                <th className="py-2">P50</th>
                <th className="py-2">P95</th>
                <th className="py-2">P99</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.stages.map((s) => (
                <tr key={s.stage}>
                  <td className="py-2 font-medium text-gray-700">{s.stage}</td>
                  <td className="py-2 text-gray-600">{s.p50}</td>
                  <td className="py-2 text-gray-600">{s.p95}</td>
                  <td className="py-2 text-gray-600">{s.p99}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">错误类型分布（近 24h）</h2>
          {summary.error_distribution.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">暂无错误</div>
          ) : (
            <div className="space-y-2">
              {summary.error_distribution.map((e) => (
                <div key={e.error_code} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-24">{e.error_code}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-red-400"
                      style={{ width: `${(e.cnt / maxError) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">{e.cnt}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">失败任务趋势（近 24h）</h2>
          {summary.task_trend.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">暂无失败任务</div>
          ) : (
            <div className="space-y-2">
              {summary.task_trend.map((t) => (
                <div key={t.hour} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-24">{t.hour}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${Math.min(100, ((t.failed + t.partial) / 10) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    failed {t.failed} · partial {t.partial}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">慢批次 TOP 10</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-400 text-xs">
              <tr>
                <th className="py-2">任务</th>
                <th className="py-2">批次</th>
                <th className="py-2">总耗时 ms</th>
                <th className="py-2">校验 ms</th>
                <th className="py-2">写入 ms</th>
                <th className="py-2">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.slow_batches_top10.map((b) => (
                <tr key={`${b.task_id}-${b.unit_id}`}>
                  <td className="py-2 text-xs text-gray-600">{b.task_id}</td>
                  <td className="py-2 text-gray-700">{b.unit_id}</td>
                  <td className="py-2">
                    <span className="font-medium text-gray-900">{b.total_duration_ms}</span>
                    <div className="w-28 h-1.5 bg-gray-100 rounded-full mt-1">
                      <div
                        className="h-full bg-orange-400 rounded-full"
                        style={{ width: `${(b.total_duration_ms / maxTotal) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2 text-gray-600">{b.validate_duration_ms}</td>
                  <td className="py-2 text-gray-600">{b.insert_duration_ms}</td>
                  <td className="py-2 text-gray-500">
                    {b.created_at ? new Date(b.created_at).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
