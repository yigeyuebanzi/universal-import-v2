'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';

interface TraceEvent {
  id: string;
  trace_id: string;
  task_id: string | null;
  unit_id: string | null;
  event_name: string;
  event_status: string;
  message: string | null;
  occurred_at: string | null;
}

interface SearchResult {
  tasks: { id: string; trace_id: string; file_name: string; status: string }[];
  errors: {
    id: string;
    task_id: string;
    unit_id: string;
    batch_index: number;
    row_number: number;
    field_name: string;
    raw_value: string;
    error_code: string;
    error_reason: string;
  }[];
  events: TraceEvent[];
}

const statusDot: Record<string, string> = {
  info: 'bg-blue-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
};

function TracesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({
    task_id: params.get('task_id') ?? '',
    trace_id: params.get('trace_id') ?? '',
    file_name: '',
    batch: '',
    row_from: '',
    row_to: '',
    error_code: '',
  });
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(form)) {
      if (v) q.set(k, v);
    }
    const headers: Record<string, string> = {};
    const key = window.sessionStorage.getItem('import_api_key');
    if (key) headers['x-api-key'] = key;
    setLoading(true);
    try {
      const res = await fetch(`/api/traces/search?${q}`, { headers });
      if (res.ok) setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params.get('trace_id') || params.get('task_id')) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = result?.events ?? [];
  const eventGroups = new Map<string, TraceEvent[]>();
  for (const e of events) {
    const key = e.task_id ?? e.trace_id;
    const arr = eventGroups.get(key) ?? [];
    arr.push(e);
    eventGroups.set(key, arr);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">链路追踪检索</h1>

      <div className="rounded-xl border border-gray-200 p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <input
          value={form.task_id}
          onChange={(e) => setForm({ ...form, task_id: e.target.value })}
          placeholder="task_id"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={form.trace_id}
          onChange={(e) => setForm({ ...form, trace_id: e.target.value })}
          placeholder="trace_id"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={form.file_name}
          onChange={(e) => setForm({ ...form, file_name: e.target.value })}
          placeholder="文件名"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={form.error_code}
          onChange={(e) => setForm({ ...form, error_code: e.target.value })}
          placeholder="错误码，如 E001"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={form.batch}
          onChange={(e) => setForm({ ...form, batch: e.target.value })}
          placeholder="批次号"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={form.row_from}
          onChange={(e) => setForm({ ...form, row_from: e.target.value })}
          placeholder="行号起"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={form.row_to}
          onChange={(e) => setForm({ ...form, row_to: e.target.value })}
          placeholder="行号止"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={search}
          className="rounded-lg bg-brand text-white font-medium text-sm flex items-center justify-center gap-1.5"
        >
          <Search className="w-4 h-4" /> 检索
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> 检索中...
        </div>
      )}

      {result && !loading && (
        <>
          <div className="text-sm text-gray-500">
            命中任务 {result.tasks.length} 个，错误 {result.errors.length} 条，时间线事件 {events.length} 条
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">失败节点</h2>
              <div className="space-y-2">
                {result.errors.map((e) => (
                  <div key={e.id} className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm">
                    <div className="flex flex-wrap gap-3 text-red-700">
                      <span>任务 {e.task_id}</span>
                      <span>批次 {e.batch_index}</span>
                      <span>行 {e.row_number}</span>
                      <span>字段 {e.field_name}</span>
                      <span>{e.error_code}</span>
                    </div>
                    <div className="mt-1 text-gray-600">
                      {e.error_reason} · 原始值（脱敏）：{e.raw_value || '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">时间线</h2>
            {events.length === 0 ? (
              <div className="text-sm text-gray-400 py-6 text-center">无时间线事件</div>
            ) : (
              <div className="relative pl-5 space-y-0">
                {events.map((e) => (
                  <div key={e.id} className="relative pb-4 pl-6 border-l border-gray-200">
                    <span
                      className={`absolute -left-[7px] top-1 w-3.5 h-3.5 rounded-full ${statusDot[e.event_status] ?? 'bg-gray-300'}`}
                    />
                    <div className="text-xs text-gray-400">
                      {e.occurred_at ? new Date(e.occurred_at).toLocaleTimeString() : '-'} · {e.task_id ?? e.trace_id}
                      {e.unit_id ? ` · ${e.unit_id}` : ''}
                    </div>
                    <div className="text-sm font-medium text-gray-800 mt-0.5">{e.event_name}</div>
                    {e.message && <div className="text-sm text-gray-500 mt-0.5">{e.message}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function TracesPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">加载中...</div>}>
      <TracesInner />
    </Suspense>
  );
}
