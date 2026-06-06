'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import { List, useListRef } from 'react-window';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Download,
  Send,
  AlertCircle,
  FileX,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { useImportStore } from '@/store/import-store';
import type { ParsedRecord } from '@/lib/rules/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress';

// ============================================================
// 常量定义
// ============================================================

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 40;
const CHECKBOX_WIDTH = 40;
const ROW_INDEX_WIDTH = 60;

const FIELD_LABELS: Record<string, string> = {
  externalCode: '外部编码',
  storeName: '收货门店',
  receiverName: '收件人姓名',
  receiverPhone: '收件人电话',
  receiverAddress: '收件人地址',
  skuCode: 'SKU编码',
  skuName: 'SKU名称',
  skuQuantity: 'SKU数量',
  skuSpec: 'SKU规格',
  remark: '备注',
};

/** 可编辑列定义 */
const EDITABLE_COLUMNS: Array<{
  id: keyof ParsedRecord;
  header: string;
  width: number;
}> = [
  { id: 'externalCode', header: '外部编码', width: 150 },
  { id: 'storeName', header: '收货门店', width: 180 },
  { id: 'receiverName', header: '收件人姓名', width: 120 },
  { id: 'receiverPhone', header: '收件人电话', width: 140 },
  { id: 'receiverAddress', header: '收件人地址', width: 200 },
  { id: 'skuCode', header: 'SKU编码', width: 140 },
  { id: 'skuName', header: 'SKU名称', width: 180 },
  { id: 'skuQuantity', header: 'SKU数量', width: 100 },
  { id: 'skuSpec', header: 'SKU规格', width: 140 },
  { id: 'remark', header: '备注', width: 150 },
];

const TOTAL_WIDTH =
  CHECKBOX_WIDTH + ROW_INDEX_WIDTH + EDITABLE_COLUMNS.reduce((s, c) => s + c.width, 0);

// ============================================================
// 导出 Excel
// ============================================================

function exportToExcel(data: ParsedRecord[]) {
  const wsData = data.map((row) => ({
    外部编码: row.externalCode ?? '',
    收货门店: row.storeName ?? '',
    收件人姓名: row.receiverName ?? '',
    收件人电话: row.receiverPhone ?? '',
    收件人地址: row.receiverAddress ?? '',
    'SKU编码': row.skuCode ?? '',
    'SKU名称': row.skuName ?? '',
    SKU数量: row.skuQuantity ?? '',
    SKU规格: row.skuSpec ?? '',
    备注: row.remark ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '预览数据');
  XLSX.writeFile(wb, '导出数据.xlsx');
}

// ============================================================
// 行渲染组件的 Props 类型（传给 rowProps）
// ============================================================

interface RowCustomProps {
  parsedData: ParsedRecord[];
  errors: Record<number, Record<string, string>>;
  selectedRows: Set<number>;
  duplicateRowIndices: Set<number>;
  dbDuplicateRows: Set<number>;
  editingCell: { rowIndex: number; field: string } | null;
  editValue: string;
  toggleRowSelection: (index: number) => void;
  startEdit: (rowIndex: number, field: string) => void;
  saveEdit: () => void;
  setEditValue: (v: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

// ============================================================
// 虚拟行组件
// ============================================================

function VirtualRow({
  index,
  style,
  parsedData,
  errors,
  selectedRows,
  duplicateRowIndices,
  dbDuplicateRows,
  editingCell,
  editValue,
  toggleRowSelection,
  startEdit,
  saveEdit,
  setEditValue,
  handleKeyDown,
}: {
  ariaAttributes: {
    'aria-posinset': number;
    'aria-setsize': number;
    role: 'listitem';
  };
  index: number;
  style: React.CSSProperties;
} & RowCustomProps) {
  const row = parsedData[index];
  const rowErrors = errors[index] ?? {};
  const isSelected = selectedRows.has(index);
  const isDuplicate = duplicateRowIndices.has(index);
  const isDbDuplicate = dbDuplicateRows.has(index);

  return (
    <div
      style={style}
      data-row-index={index}
      className={`
        flex items-center border-b text-sm transition-colors
        ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50/80'}
      `}
    >
      {/* Checkbox 单元格 */}
      <div
        className="flex shrink-0 items-center justify-center border-r bg-white"
        style={{
          width: CHECKBOX_WIDTH,
          position: 'sticky',
          left: 0,
          zIndex: 10,
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleRowSelection(index)}
          className="size-4 cursor-pointer accent-[#0fc6c2]"
        />
      </div>

      {/* 序号单元格 */}
      <div
        className={`flex shrink-0 items-center justify-center border-r px-2 text-center text-xs text-gray-500 ${
          isSelected ? 'bg-blue-50' : 'bg-white'
        }`}
        style={{
          width: ROW_INDEX_WIDTH,
          position: 'sticky',
          left: CHECKBOX_WIDTH,
          zIndex: 10,
        }}
      >
        {index + 1}
        {isDuplicate && (
          <span className="ml-0.5 text-[10px] text-orange-500">⇄</span>
        )}
        {isDbDuplicate && !isDuplicate && (
          <span className="ml-0.5 text-[10px] text-orange-500">⚠</span>
        )}
      </div>

      {/* 数据单元格 */}
      {EDITABLE_COLUMNS.map((col) => {
        const field = col.id;
        const cellValue = row?.[field];
        const cellError = rowErrors[field as string];
        const isEditing =
          editingCell?.rowIndex === index && editingCell?.field === field;
        const isExternalCodeDuplicate =
          field === 'externalCode' && isDuplicate;
        const isExternalCodeDbDuplicate =
          field === 'externalCode' && isDbDuplicate;

        return (
          <div
            key={field}
            className={`
              relative flex shrink-0 items-center border-r px-1 last:border-r-0
              ${isSelected ? 'bg-blue-50' : ''}
              ${isExternalCodeDuplicate && !isSelected ? 'bg-orange-100' : ''}
              ${isExternalCodeDbDuplicate && !isSelected && !isExternalCodeDuplicate ? 'bg-orange-50' : ''}
            `}
            style={{ width: col.width }}
            title={cellError || undefined}
          >
            {isEditing ? (
              <input
                autoFocus
                className="h-7 w-full rounded border border-[#0fc6c2] bg-white px-1.5 text-sm outline-none focus:ring-1 focus:ring-[#0fc6c2]/30"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => saveEdit()}
                onKeyDown={handleKeyDown}
              />
            ) : (
              <div
                className={`
                  h-full w-full cursor-text overflow-hidden text-ellipsis whitespace-nowrap
                  rounded px-1.5 py-1 text-sm leading-5
                  ${cellError ? 'border border-red-400 bg-red-50/50' : ''}
                `}
                onClick={() => startEdit(index, field)}
              >
                {cellValue !== undefined && cellValue !== null && cellValue !== ''
                  ? String(cellValue)
                  : ''}
                {isExternalCodeDbDuplicate && (
                  <span className="ml-1 text-xs text-orange-600">
                    (与已有数据重复)
                  </span>
                )}
              </div>
            )}
            {/* 错误指示器 - 右上角小红点 */}
            {cellError && !isEditing && (
              <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-red-500" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PreviewPage() {
  const router = useRouter();
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  // ---- Store ----
  const parsedData = useImportStore((s) => s.parsedData);
  const errors = useImportStore((s) => s.errors);
  const selectedRows = useImportStore((s) => s.selectedRows);
  const duplicateCodes = useImportStore((s) => s.duplicateCodes);
  const dbDuplicateRows = useImportStore((s) => s.dbDuplicateRows);
  const updateCell = useImportStore((s) => s.updateCell);
  const addRow = useImportStore((s) => s.addRow);
  const deleteRows = useImportStore((s) => s.deleteRows);
  const toggleRowSelection = useImportStore((s) => s.toggleRowSelection);
  const selectAllRows = useImportStore((s) => s.selectAllRows);
  const clearSelection = useImportStore((s) => s.clearSelection);
  const setDbDuplicateRows = useImportStore((s) => s.setDbDuplicateRows);
  const getErrorCount = useImportStore((s) => s.getErrorCount);
  const getErrorList = useImportStore((s) => s.getErrorList);

  // ---- 本地状态 ----
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    field: string;
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [errorPanelOpen, setErrorPanelOpen] = useState(true);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // ---- 计算值 ----
  const errorCount = getErrorCount();
  const errorList = getErrorList();
  const hasData = parsedData.length > 0;

  // 构建重复行索引集合（批内重复）
  const duplicateRowIndices = useMemo(() => {
    const set = new Set<number>();
    Object.values(duplicateCodes).forEach((indices) => {
      indices.forEach((i) => set.add(i));
    });
    return set;
  }, [duplicateCodes]);

  const isAllSelected = hasData && selectedRows.size === parsedData.length;

  // ---- @tanstack/react-table (列定义用于表头结构参考) ----
  const columns = useMemo<ColumnDef<ParsedRecord, unknown>[]>(
    () =>
      [
        {
          id: '_select',
          header: () => null,
          cell: () => null,
          size: CHECKBOX_WIDTH,
          enableResizing: false,
        },
        {
          id: '_rowIndex',
          header: '序号',
          cell: () => null,
          size: ROW_INDEX_WIDTH,
          enableResizing: false,
        },
        ...EDITABLE_COLUMNS.map((col) => ({
          id: col.id as string,
          accessorKey: col.id as string,
          header: col.header,
          size: col.width,
          cell: () => null,
        })),
      ] as ColumnDef<ParsedRecord, unknown>[],
    []
  );

  // useReactTable 用于获取列结构信息
  useReactTable({
    data: parsedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
  });

  // ---- 容器高度计算 ----
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerHeight(Math.max(300, window.innerHeight - rect.top - 40));
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // ---- DB重复检测 ----
  useEffect(() => {
    if (!hasData) return;
    const codes = parsedData
      .map((r) => r.externalCode?.trim())
      .filter(Boolean);
    if (codes.length === 0) return;

    fetch('/api/orders/check-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes }),
    })
      .then((res) => res.json())
      .then((data: { duplicateCodes?: string[] }) => {
        if (data.duplicateCodes?.length) {
          const dupSet = new Set<number>();
          const dupCodeSet = new Set(data.duplicateCodes);
          parsedData.forEach((row, idx) => {
            if (row.externalCode?.trim() && dupCodeSet.has(row.externalCode.trim())) {
              dupSet.add(idx);
            }
          });
          setDbDuplicateRows(dupSet);
        }
      })
      .catch(() => {
        // API不可用时静默忽略
      });
  }, [parsedData, hasData, setDbDuplicateRows]);

  // ---- 编辑处理 ----
  const startEdit = useCallback(
    (rowIndex: number, field: string) => {
      const value = parsedData[rowIndex]?.[field as keyof ParsedRecord];
      setEditValue(value !== undefined && value !== null ? String(value) : '');
      setEditingCell({ rowIndex, field });
    },
    [parsedData]
  );

  const saveEdit = useCallback(() => {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell;
    let value: string | number = editValue;
    if (field === 'skuQuantity') {
      value = editValue === '' ? '' : Number(editValue);
    }
    updateCell(rowIndex, field, value);
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, updateCell]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editingCell) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        saveEdit();
        // Tab -> 下一列
        const colIdx = EDITABLE_COLUMNS.findIndex((c) => c.id === editingCell.field);
        if (!e.shiftKey && colIdx < EDITABLE_COLUMNS.length - 1) {
          setTimeout(
            () => startEdit(editingCell.rowIndex, EDITABLE_COLUMNS[colIdx + 1].id as string),
            0
          );
        } else if (e.shiftKey && colIdx > 0) {
          setTimeout(
            () => startEdit(editingCell.rowIndex, EDITABLE_COLUMNS[colIdx - 1].id as string),
            0
          );
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
        // Enter -> 下一行同列
        if (editingCell.rowIndex < parsedData.length - 1) {
          setTimeout(() => startEdit(editingCell.rowIndex + 1, editingCell.field), 0);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [editingCell, saveEdit, cancelEdit, startEdit, parsedData.length]
  );

  // ---- 错误定位滚动 ----
  const scrollToRow = useCallback((rowIndex: number) => {
    listRef.current?.scrollToRow({ index: rowIndex, align: 'center' });
    // 短暂高亮
    const el = document.querySelector(`[data-row-index="${rowIndex}"]`);
    if (el) {
      el.classList.add('bg-yellow-50');
      setTimeout(() => el.classList.remove('bg-yellow-50'), 2000);
    }
  }, [listRef]);

  // ---- 提交下单 ----
  const handleSubmit = useCallback(() => {
    const currentErrors = useImportStore.getState().errors;
    const totalErrors = Object.values(currentErrors).reduce(
      (s, e) => s + Object.keys(e).length,
      0
    );
    if (totalErrors > 0) {
      toast.error(`请先修正${totalErrors}条错误`);
      return;
    }
    setSubmitDialogOpen(true);
  }, []);

  const confirmSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitProgress(0);

    const data = useImportStore.getState().parsedData;

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setSubmitProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 300);

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      clearInterval(progressInterval);
      setSubmitProgress(100);

      const result = await res.json();
      const successCount = result.successCount ?? data.length;
      const failCount = result.failCount ?? 0;

      setTimeout(() => {
        setSubmitting(false);
        setSubmitDialogOpen(false);
        setSubmitProgress(0);
        toast.success(`提交完成：成功${successCount}条，失败${failCount}条`);
        router.push('/orders');
      }, 800);
    } catch {
      setSubmitting(false);
      setSubmitDialogOpen(false);
      setSubmitProgress(0);
      toast.error('提交失败，请重试');
    }
  }, [router]);

  // ---- 删除选中 ----
  const handleDeleteSelected = useCallback(() => {
    if (selectedRows.size === 0) {
      toast.info('请先选择要删除的行');
      return;
    }
    deleteRows(Array.from(selectedRows));
    toast.success(`已删除${selectedRows.size}行`);
  }, [selectedRows, deleteRows]);

  // ---- rowProps 传给 List 的行组件 ----
  const rowProps = useMemo<RowCustomProps>(
    () => ({
      parsedData,
      errors,
      selectedRows,
      duplicateRowIndices,
      dbDuplicateRows,
      editingCell,
      editValue,
      toggleRowSelection,
      startEdit,
      saveEdit,
      setEditValue,
      handleKeyDown,
    }),
    [
      parsedData,
      errors,
      selectedRows,
      duplicateRowIndices,
      dbDuplicateRows,
      editingCell,
      editValue,
      toggleRowSelection,
      startEdit,
      saveEdit,
      setEditValue,
      handleKeyDown,
    ]
  );

  // ============================================================
  // 渲染
  // ============================================================

  // 空状态
  if (!hasData) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <FileX className="size-16 text-gray-300" />
        <p className="text-lg text-muted-foreground">暂无数据，请先导入文件</p>
      </div>
    );
  }

  const listHeight = Math.min(
    containerHeight - HEADER_HEIGHT,
    parsedData.length * ROW_HEIGHT
  );

  return (
    <div className="flex flex-col gap-4" ref={containerRef}>
      {/* ===== 页面标题 ===== */}
      <h1 className="text-xl font-semibold text-gray-900">数据预览</h1>

      {/* ===== 错误汇总面板 ===== */}
      {errorCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/50">
          <button
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
            onClick={() => setErrorPanelOpen(!errorPanelOpen)}
          >
            <AlertCircle className="size-4 text-red-500" />
            <span className="text-sm font-medium text-red-700">
              共 {errorCount} 条错误
            </span>
            <Badge variant="destructive" className="ml-1">
              {errorCount}
            </Badge>
            {errorPanelOpen ? (
              <ChevronUp className="ml-auto size-4 text-red-400" />
            ) : (
              <ChevronDown className="ml-auto size-4 text-red-400" />
            )}
          </button>
          {errorPanelOpen && (
            <div className="max-h-48 overflow-y-auto border-t border-red-200 px-4 py-2">
              {errorList.map((err, idx) => (
                <div
                  key={`${err.rowIndex}-${err.field}-${idx}`}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-red-600 hover:bg-red-100/50"
                  onClick={() => scrollToRow(err.rowIndex)}
                >
                  <span className="shrink-0 font-medium">
                    第{err.rowIndex + 1}行
                  </span>
                  <span className="text-red-400">-</span>
                  <span className="shrink-0">
                    {FIELD_LABELS[err.field] || err.field}
                  </span>
                  <span className="text-red-400">-</span>
                  <span className="truncate">{err.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== 操作栏 ===== */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" />
          新增行
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDeleteSelected}
          disabled={selectedRows.size === 0}
        >
          <Trash2 className="size-4" />
          删除选中{selectedRows.size > 0 ? `(${selectedRows.size})` : ''}
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportToExcel(parsedData)}>
          <Download className="size-4" />
          导出Excel
        </Button>
        <Button
          size="sm"
          className="bg-emerald-500 hover:bg-emerald-600 text-white"
          onClick={handleSubmit}
        >
          <Send className="size-4" />
          提交下单
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          共 <span className="font-medium text-foreground">{parsedData.length}</span>{' '}
          条数据
          {errorCount > 0 && (
            <>
              ，
              <span className="font-medium text-red-500">{errorCount}</span> 条错误
            </>
          )}
        </span>
      </div>

      {/* ===== 表格区域 ===== */}
      <div className="overflow-hidden rounded-lg border bg-white">
        <div className="overflow-x-auto">
          <div style={{ minWidth: TOTAL_WIDTH }}>
            {/* 表头 */}
            <div
              className="flex items-center border-b bg-gray-50 text-xs font-medium text-gray-500"
              style={{ height: HEADER_HEIGHT }}
            >
              {/* Checkbox 表头 */}
              <div
                className="flex shrink-0 items-center justify-center border-r bg-gray-50"
                style={{
                  width: CHECKBOX_WIDTH,
                  position: 'sticky',
                  left: 0,
                  zIndex: 20,
                }}
              >
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={() =>
                    isAllSelected ? clearSelection() : selectAllRows()
                  }
                  className="size-4 cursor-pointer accent-[#0fc6c2]"
                />
              </div>
              {/* 序号表头 */}
              <div
                className="flex shrink-0 items-center justify-center border-r bg-gray-50 px-2 text-center"
                style={{
                  width: ROW_INDEX_WIDTH,
                  position: 'sticky',
                  left: CHECKBOX_WIDTH,
                  zIndex: 20,
                }}
              >
                序号
              </div>
              {/* 数据列表头 */}
              {EDITABLE_COLUMNS.map((col) => (
                <div
                  key={col.id}
                  className="flex shrink-0 items-center border-r px-3 last:border-r-0"
                  style={{ width: col.width }}
                >
                  {col.header}
                </div>
              ))}
            </div>

            {/* 虚拟列表 react-window v2 */}
            <List
              listRef={listRef}
              rowComponent={VirtualRow}
              rowCount={parsedData.length}
              rowHeight={ROW_HEIGHT}
              rowProps={rowProps}
              overscanCount={10}
              defaultHeight={listHeight}
              style={{ height: listHeight, overflow: 'auto' }}
            />
          </div>
        </div>
      </div>

      {/* ===== 提交确认 Dialog ===== */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认提交</DialogTitle>
            <DialogDescription>
              确认提交 {parsedData.length} 条数据？
            </DialogDescription>
          </DialogHeader>

          {submitting && (
            <div className="py-4">
              <Progress value={submitProgress}>
                <ProgressLabel>提交中...</ProgressLabel>
                <ProgressValue>
                  {() => `${Math.round(submitProgress)}%`}
                </ProgressValue>
              </Progress>
              <ProgressTrack>
                <ProgressIndicator
                  style={{ width: `${submitProgress}%` }}
                />
              </ProgressTrack>
            </div>
          )}

          {!submitting && (
            <DialogFooter>
              <DialogClose>
                <Button variant="outline" size="sm">
                  取消
                </Button>
              </DialogClose>
              <Button
                size="sm"
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={confirmSubmit}
              >
                确认提交
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}