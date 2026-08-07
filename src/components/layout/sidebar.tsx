"use client";

import { FileInput, LayoutDashboard, ListChecks, LineChart, Route, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { label: "总览", href: "/", icon: LayoutDashboard },
  { label: "文件导入", href: "/import", icon: FileInput },
  { label: "导入任务", href: "/tasks", icon: ListChecks },
  { label: "监控看板", href: "/monitor", icon: LineChart },
  { label: "链路追踪", href: "/traces", icon: Route },
  { label: "规则管理", href: "/rules", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-[56px] bottom-0 w-[200px] bg-white border-r border-gray-200 z-30 flex flex-col">
      <nav className="flex-1 py-2">
        {menuItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-5 h-11 text-sm font-medium
                border-l-[3px] transition-colors
                ${
                  isActive
                    ? "border-l-brand bg-brand-light text-brand"
                    : "border-l-transparent text-[#4e5969] hover:bg-gray-50"
                }
              `}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
