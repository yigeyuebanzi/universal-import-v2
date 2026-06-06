'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, RotateCcw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface OrderRow {
  orderId: string;
  externalCode: string | null;
  storeName: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  remark: string | null;
  createdAt: string | null;
  skuCode: string | null;
  skuName: string | null;
  skuQuantity: string | null;
  skuSpec: string | null;
}

interface ApiResponse {
  data: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function OrdersPage() {
  // Filter state
  const [externalCode, setExternalCode] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // Data & loading
  const [data, setData] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Jump page
  const [jumpPage, setJumpPage] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (externalCode) params.set('externalCode', externalCode);
      if (receiverName) params.set('receiverName', receiverName);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/orders?${params.toString()}`);
      const json: ApiResponse = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, externalCode, receiverName, startDate, endDate]);

  // Auto-fetch on mount and when params change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = () => {
    setPage(1);
    // fetchData will be triggered by page change
  };

  const handleReset = () => {
    setExternalCode('');
    setReceiverName('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handlePageSizeChange = (newSize: string | null) => {
  if (!newSize) return;
    setPageSize(Number(newSize));
    setPage(1);
  };

  const handleJumpPage = () => {
    const p = Number(jumpPage);
    if (p >= 1 && p <= totalPages) {
      setPage(p);
      setJumpPage('');
    }
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
  };

  return (
    <div className="space-y-4">
      {/* Page Title */}
      <h1 className="text-lg font-semibold text-gray-900">运单列表</h1>

      {/* Filter Area */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">外部编码</label>
          <Input
            placeholder="请输入外部编码"
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            className="w-[180px] h-8"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">收件人姓名</label>
          <Input
            placeholder="请输入收件人"
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            className="w-[180px] h-8"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">提交时间</label>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[150px] h-8"
            />
            <span className="text-gray-400 text-sm">-</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[150px] h-8"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            onClick={handleSearch}
            className="bg-brand hover:bg-brand-dark text-white h-8 px-4"
          >
            <Search className="h-3.5 w-3.5 mr-1" />
            查询
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            className="h-8 px-4 text-gray-600"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            重置
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="text-gray-600 font-medium text-xs h-9">外部编码</TableHead>
              <TableHead className="text-gray-600 font-medium text-xs h-9">收货门店</TableHead>
              <TableHead className="text-gray-600 font-medium text-xs h-9">收件人姓名</TableHead>
              <TableHead className="text-gray-600 font-medium text-xs h-9">收件人电话</TableHead>
              <TableHead className="text-gray-600 font-medium text-xs h-9">收件人地址</TableHead>
              <TableHead className="text-gray-600 font-medium text-xs h-9">SKU编码</TableHead>
              <TableHead className="text-gray-600 font-medium text-xs h-9">SKU名称</TableHead>
              <TableHead className="text-gray-600 font-medium text-xs h-9 text-right">SKU数量</TableHead>
              <TableHead className="text-gray-600 font-medium text-xs h-9">SKU规格</TableHead>
              <TableHead className="text-gray-600 font-medium text-xs h-9">备注</TableHead>
              <TableHead className="text-gray-600 font-medium text-xs h-9">提交时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="h-48 text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>加载中...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-48 text-center text-gray-400">
                  暂无运单数据
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, idx) => (
                <TableRow key={`${row.orderId}-${idx}`} className="hover:bg-gray-50">
                  <TableCell className="text-xs">{row.externalCode || '-'}</TableCell>
                  <TableCell className="text-xs">{row.storeName || '-'}</TableCell>
                  <TableCell className="text-xs">{row.receiverName || '-'}</TableCell>
                  <TableCell className="text-xs">{row.receiverPhone || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate" title={row.receiverAddress || ''}>{row.receiverAddress || '-'}</TableCell>
                  <TableCell className="text-xs">{row.skuCode || '-'}</TableCell>
                  <TableCell className="text-xs">{row.skuName || '-'}</TableCell>
                  <TableCell className="text-xs text-right">{row.skuQuantity || '-'}</TableCell>
                  <TableCell className="text-xs">{row.skuSpec || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate" title={row.remark || ''}>{row.remark || '-'}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span>共 <span className="font-medium text-gray-900">{total}</span> 条</span>
              <span className="text-gray-300">|</span>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-7 w-[90px] text-xs" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10条/页</SelectItem>
                  <SelectItem value="20">20条/页</SelectItem>
                  <SelectItem value="50">50条/页</SelectItem>
                  <SelectItem value="100">100条/页</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              {/* Prev */}
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center justify-center w-7 h-7 rounded border border-gray-200 text-gray-500 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-500 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {/* Page numbers */}
              {getPageNumbers().map((p, idx) =>
                typeof p === 'string' ? (
                  <span key={`ellipsis-${idx}`} className="w-7 h-7 flex items-center justify-center text-xs text-gray-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 flex items-center justify-center rounded text-xs transition-colors ${
                      page === p
                        ? 'bg-brand text-white border border-brand'
                        : 'border border-gray-200 text-gray-600 hover:border-brand hover:text-brand'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

              {/* Next */}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center justify-center w-7 h-7 rounded border border-gray-200 text-gray-500 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-500 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Jump to page */}
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <span>前往</span>
              <Input
                value={jumpPage}
                onChange={(e) => setJumpPage(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleJumpPage()}
                className="w-[48px] h-7 text-center text-xs"
              />
              <span>页</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
