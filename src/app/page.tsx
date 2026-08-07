import Link from 'next/link';
import { FileInput, LineChart, ListChecks, Route, Settings } from 'lucide-react';

const cards = [
  {
    title: '文件导入',
    description: '上传 Excel / Word / PDF，1 秒内返回 task_id，后台异步执行。',
    href: '/import',
    icon: FileInput,
  },
  {
    title: '导入任务',
    description: '查看任务进度、行级错误、批次性能与失败明细。',
    href: '/tasks',
    icon: ListChecks,
  },
  {
    title: '监控看板',
    description: '吞吐量、队列积压、阶段耗时 P50/P95/P99、错误分布。',
    href: '/monitor',
    icon: LineChart,
  },
  {
    title: '链路追踪',
    description: '按 task_id / trace_id / 文件名 / 批次 / 行号 / 错误码检索时间线。',
    href: '/traces',
    icon: Route,
  },
  {
    title: '规则管理',
    description: '复用 V2 可配置解析规则引擎，支持 AI 辅助生成规则。',
    href: '/rules',
    icon: Settings,
  },
];

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">V2 下单流程异步事件驱动重构</h1>
      <p className="text-gray-500 mb-8">
        Transactional Outbox → BullMQ 队列 → 批量 SKU 校验 → 批量 UPSERT → 行级错误 → 全链路 Trace
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border border-gray-200 bg-white p-5 hover:border-brand hover:shadow-sm transition-shadow"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-light text-brand flex items-center justify-center mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <h2 className="font-semibold text-gray-900">{card.title}</h2>
              <p className="text-sm text-gray-500 mt-1">{card.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
