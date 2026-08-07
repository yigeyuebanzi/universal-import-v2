'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

interface TaskItem {
  id: string;
  trace_id: string;
  file_name: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  total_batches: number;
  completed_batches: number;
  degraded: boolean;
  created_at: string | null;
}

const statusColor: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  partial_success: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);

  useEffect(() => {
    let stopped = false;
    async function load() {
      const headers: Record<string, string> = {};
      const key = window.sessionStorage.getItem('import_api_key');
      if (key) headers['x-api-key'] = key;
      const res = await fetch('/api/import-tasks?limit=20', { headers });
      if (!res.ok) return;
      const body = await res.json();
      if (!stopped) setTasks(body.data ?? []);
    }
    load();
    const timer = setInterval(load, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">导入任务</h1>
      <p className="text-gray-500 mb-6">最近 20 个任务，每 3 秒自动刷新。</p>

      {!tasks ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">任务</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">进度</th>
                <th className="px-4 py-3 font-medium">成功/失败</th>
                <th className="px-4 py-3 font-medium">批次</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/tasks/${t.id}`} className="text-brand font-medium hover:underline">
                      {t.file_name}
                    </Link>
                    <div className="text-xs text-gray-400 mt-0.5">{t.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[t.status] ?? ''}`}>
                      {t.status}
                    </span>
                    {t.degraded && (
                      <span className="ml-2 px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-700">降级</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.processed_rows}/{t.total_rows}
                    <div className="w-28 h-1.5 bg-gray-100 rounded-full mt-1">
                      <div
                        className="h-full bg-brand rounded-full"
                        style={{ width: `${t.total_rows ? Math.min(100, (t.processed_rows / t.total_rows) * 100) : 0}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-emerald-600">{t.success_rows}</span> /{' '}
                    <span className="text-red-500">{t.failed_rows}</span>
                  </td>
                  <td className="px-4 py-3">
                    {t.completed_batches}/{t.total_batches}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {t.created_at ? new Date(t.created_at).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
