import { Activity } from "lucide-react";

export default function Header() {
  return (
    <header className="fixed left-0 top-0 right-0 h-[56px] bg-white border-b border-gray-200 z-40 flex items-center px-6 gap-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand text-white flex items-center justify-center">
          <Activity className="w-4 h-4" />
        </div>
        <span className="font-semibold text-[15px] text-gray-900">
          万能导入 V4 · 异步事件驱动版
        </span>
      </div>
      <span className="ml-auto text-xs text-gray-400">上传即返回 · 批量处理 · 全链路可观测</span>
    </header>
  );
}
