'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Download, Loader2 } from 'lucide-react';

interface TaskDetail {
  task_id: string;
  trace_id: string;
  file_name: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  degraded_rows: number;
  total_batches: number;
  completed_batches: number;
  degraded: boolean;
  throughput_per_minute: number;
  eta_seconds: number | null;
  created_at: string | null;
  completed_at: string | null;
  error: string | null;
}

interface ErrorRow {
  id: string;
  batch_index: number;
  row_number: number;
  field_name: string;
  raw_value: string;
  error_code: string;
  error_code_label: string;
  error_reason: string;
  suggestion: string | null;
  trace_id: string;
}

interface BatchRow {
  id: string;
  unit_id: string;
  batch_index: number;
  start_row: number;
  end_row: number;
  status: string;
  retry_count: number;
  success_rows: number;
  failed_rows: number;
  sku_validation_skipped: boolean;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
}

const statusColor: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  partial_success: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  retry: 'bg-orange-100 text-orange-700',
};

function headers(): Record<string, string> {
  const h: Record<string, string> = {};
  const key = window.sessionStorage.getItem('import_api_key');
  if (key) h['x-api-key'] = key;
  return h;
}

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = params.taskId;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [errorTotal, setErrorTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [batchFilter, setBatchFilter] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [notFound, setNotFound] = useState(false);

  const loadTask = useCallback(async () => {
    const res = await fetch(`/api/import-tasks/${taskId}`, { headers: headers() });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.ok) setTask(await res.json());
  }, [taskId]);

  const loadErrors = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), page_size: '50' });
    if (batchFilter) q.set('batch', batchFilter);
    if (codeFilter) q.set('error_code', codeFilter);
    const res = await fetch(`/api/import-tasks/${taskId}/errors?${q}`, { headers: headers() });
    if (res.ok) {
      const body = await res.json();
      setErrors(body.data ?? []);
      setErrorTotal(body.total ?? 0);
    }
  }, [taskId, page, batchFilter, codeFilter]);

  useEffect(() => {
    loadTask();
    const timer = setInterval(loadTask, 2000);
    return () => clearInterval(timer);
  }, [loadTask]);

  useEffect(() => {
    loadErrors();
  }, [loadErrors]);

  useEffect(() => {
    fetch(`/api/import-tasks/${taskId}/batches`, { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setBatches(b.data ?? []));
  }, [taskId]);

  if (notFound) {
    return <div className="text-gray-500">任务不存在或已被清理。</div>;
  }

  if (!task) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> 加载任务中...
      </div>
    );
  }

  const progress = task.total_rows ? Math.min(100, (task.processed_rows / task.total_rows) * 100) : 0;
  const codeOptions = [...new Set(errors.map((e) => e.error_code))];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{task.file_name}</h1>
        <div className="text-sm text-gray-400 mt-1">
          {task.task_id} · trace:{' '}
          <Link href={`/traces?trace_id=${task.trace_id}`} className="text-brand hover:underline">
            {task.trace_id}
          </Link>
        </div>
      </div>

      {task.degraded && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-orange-800 text-sm">
          ⚠️ SKU 校验已降级：本次导入未经过商品主数据完整校验，数据可能需要后续复核。
          {task.degraded_rows > 0 && <span>（{task.degraded_rows} 行未经过 SKU 校验）</span>}
        </div>
      )}

      {task.error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 text-sm">
          任务错误：{task.error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="状态" value={task.status} badge={statusColor[task.status] ?? ''} />
        <Stat label="进度" value={`${task.processed_rows} / ${task.total_rows}`} sub={`${progress.toFixed(1)}%`} />
        <Stat label="成功 / 失败" value={`${task.success_rows} / ${task.failed_rows}`} />
        <Stat label="吞吐量" value={`${task.throughput_per_minute} 行/分`} sub={task.eta_seconds ? `预计剩余 ${task.eta_seconds}s` : undefined} />
      </div>

      <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">行级错误（{errorTotal}）</h2>
          <div className="flex items-center gap-2">
            <select
              value={batchFilter}
              onChange={(e) => {
                setBatchFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            >
              <option value="">全部批次</option>
              {batches.map((b) => (
                <option key={b.id} value={b.batch_index}>
                  批次 {b.batch_index}
                </option>
              ))}
            </select>
            <select
              value={codeFilter}
              onChange={(e) => {
                setCodeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            >
              <option value="">全部错误码</option>
              {codeOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <a
              href={`/api/import-tasks/${taskId}/errors/export`}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:border-brand"
            >
              <Download className="w-3.5 h-3.5" /> 导出 CSV
            </a>
          </div>
        </div>
        {errors.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">暂无错误明细</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">批次</th>
                  <th className="px-3 py-2">行号</th>
                  <th className="px-3 py-2">字段</th>
                  <th className="px-3 py-2">原始值（脱敏）</th>
                  <th className="px-3 py-2">错误码</th>
                  <th className="px-3 py-2">原因</th>
                  <th className="px-3 py-2">建议</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {errors.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{e.batch_index}</td>
                    <td className="px-3 py-2">{e.row_number}</td>
                    <td className="px-3 py-2">{e.field_name}</td>
                    <td className="px-3 py-2 font-mono text-gray-600">{e.raw_value || '-'}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600">{e.error_code}</span>
                      <span className="ml-1 text-gray-400">{e.error_code_label}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{e.error_reason}</td>
                    <td className="px-3 py-2 text-gray-500">{e.suggestion ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {errorTotal > 50 && (
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40"
            >
              上一页
            </button>
            <span className="text-xs text-gray-500 self-center">第 {page} 页</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 50 >= errorTotal}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">批次性能</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2">批次</th>
                <th className="px-3 py-2">行范围</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">成功/失败</th>
                <th className="px-3 py-2">重试</th>
                <th className="px-3 py-2">SKU降级</th>
                <th className="px-3 py-2">完成时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">{b.unit_id}</td>
                  <td className="px-3 py-2">
                    {b.start_row}-{b.end_row}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] ${statusColor[b.status] ?? ''}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-emerald-600">{b.success_rows}</span>/
                    <span className="text-red-500">{b.failed_rows}</span>
                  </td>
                  <td className="px-3 py-2">{b.retry_count}</td>
                  <td className="px-3 py-2">{b.sku_validation_skipped ? '是' : '否'}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {b.completed_at ? new Date(b.completed_at).toLocaleTimeString() : '-'}
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

function Stat({ label, value, sub, badge }: { label: string; value: string; sub?: string; badge?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold text-gray-900 ${badge ? `inline-block px-2 py-0.5 rounded-full text-xs ${badge}` : ''}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
