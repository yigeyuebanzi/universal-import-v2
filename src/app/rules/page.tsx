'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Copy, Trash2, FileSpreadsheet, FileText, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface RuleItem {
  id: string;
  name: string;
  description: string | null;
  fileType: string;
  ruleConfig: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

const fileTypeIcons: Record<string, React.ReactNode> = {
  excel: <FileSpreadsheet className="size-4 text-emerald-600" />,
  word: <FileText className="size-4 text-blue-600" />,
  pdf: <File className="size-4 text-red-500" />,
};

const fileTypeLabels: Record<string, string> = {
  excel: 'Excel',
  word: 'Word',
  pdf: 'PDF',
};

export default function RulesPage() {
  const router = useRouter();
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<RuleItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/rules');
      if (!res.ok) throw new Error('获取规则列表失败');
      const data = await res.json();
      setRules(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []);
    } catch {
      toast.error('获取规则列表失败');
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/rules/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast.success('规则已删除');
      setDeleteTarget(null);
      fetchRules();
    } catch {
      toast.error('删除规则失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async (rule: RuleItem) => {
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${rule.name} (副本)`,
          description: rule.description,
          fileType: rule.fileType,
          ruleConfig: rule.ruleConfig,
        }),
      });
      if (!res.ok) throw new Error('复制失败');
      toast.success('规则已复制');
      fetchRules();
    } catch {
      toast.error('复制规则失败');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 & 操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">规则管理</h1>
          <p className="mt-1 text-sm text-[#4e5969]">配置数据映射和转换规则</p>
        </div>
        <Link href="/rules/new">
          <Button className="bg-brand hover:bg-brand-dark text-white">
            <Plus className="size-4" />
            新增
          </Button>
        </Link>
      </div>

      {/* 表格 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-[#4e5969]">
          加载中...
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-sm text-[#4e5969]">
          <FileText className="size-12 text-gray-300 mb-4" />
          <p>暂无解析规则，点击新增创建</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead className="text-xs font-medium text-[#4e5969]">规则名称</TableHead>
                <TableHead className="text-xs font-medium text-[#4e5969]">文件类型</TableHead>
                <TableHead className="text-xs font-medium text-[#4e5969]">描述</TableHead>
                <TableHead className="text-xs font-medium text-[#4e5969]">创建时间</TableHead>
                <TableHead className="text-xs font-medium text-[#4e5969] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} className="hover:bg-brand-light/30">
                  <TableCell className="font-medium text-gray-900">
                    <Link href={`/rules/${rule.id}`} className="hover:text-brand transition-colors">
                      {rule.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      {fileTypeIcons[rule.fileType] || <File className="size-4" />}
                      {fileTypeLabels[rule.fileType] || rule.fileType}
                    </span>
                  </TableCell>
                  <TableCell className="text-[#4e5969] max-w-[300px] truncate">
                    {rule.description || '-'}
                  </TableCell>
                  <TableCell className="text-[#4e5969] text-sm">
                    {formatDate(rule.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-3">
                      <Link
                        href={`/rules/${rule.id}`}
                        className="text-brand hover:text-brand-dark text-sm transition-colors"
                      >
                        <Pencil className="inline size-3.5 mr-0.5" />
                        编辑
                      </Link>
                      <button
                        onClick={() => handleCopy(rule)}
                        className="text-brand hover:text-brand-dark text-sm transition-colors"
                      >
                        <Copy className="inline size-3.5 mr-0.5" />
                        复制
                      </button>
                      <button
                        onClick={() => setDeleteTarget(rule)}
                        className="text-red-500 hover:text-red-600 text-sm transition-colors"
                      >
                        <Trash2 className="inline size-3.5 mr-0.5" />
                        删除
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 删除确认 Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除规则「{deleteTarget?.name}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              取消
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
