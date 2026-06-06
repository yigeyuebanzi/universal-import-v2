'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  Upload,
  Plus,
  Sparkles,
  Loader2,
  FileSpreadsheet,
  FileText,
  File,
  Trash2,
  Play,
  Info,
} from 'lucide-react';

import { useImportStore } from '@/store/import-store';
import { parseExcel } from '@/lib/parsers/excel';
import { parseExcelInWorker } from '@/lib/parsers/excel-worker-client';
import { ruleEngine } from '@/lib/rules/engine';
import type { ParseRule } from '@/lib/rules/types';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
} from '@/components/ui/progress';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

// ========== 规则列表项类型 ==========
interface RuleListItem {
  id: string;
  name: string;
  description: string | null;
  fileType: string;
  ruleConfig: ParseRule;
  createdAt: string | null;
  updatedAt: string | null;
}

// ========== 文件大小格式化 ==========
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ========== 文件类型图标 ==========
function FileIcon({ type }: { type: string | null }) {
  if (type === 'excel') return <FileSpreadsheet className="size-5 text-emerald-600" />;
  if (type === 'word') return <FileText className="size-5 text-blue-600" />;
  if (type === 'pdf') return <File className="size-5 text-red-500" />;
  return <File className="size-5 text-gray-400" />;
}

export default function ImportPage() {
  const router = useRouter();
  const {
    file,
    fileName,
    fileType,
    selectedRuleId,
    isParsing,
    parseProgress,
    parseStatus,
    parsedData,
    setFile,
    setSelectedRule,
    setParsing,
    setParseProgress,
    setParsedData,
    setParseErrors,
    reset,
  } = useImportStore();

  // 规则列表
  const [rules, setRules] = useState<RuleListItem[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  // AI 生成状态
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    rule: Partial<ParseRule>;
    confidence: Record<string, number>;
    explanation: string;
  } | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  // 解析中状态
  const [parseStarting, setParseStarting] = useState(false);

  // ========== 加载规则列表 ==========
  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      if (data.success) {
        setRules(data.data || []);
      }
    } catch {
      toast.error('获取规则列表失败');
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // 文件上传后自动刷新规则列表（按文件类型过滤可后续优化）
  useEffect(() => {
    if (file) {
      loadRules();
    }
  }, [file, loadRules]);

  // ========== Dropzone 配置 ==========
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const f = acceptedFiles[0];
      if (!f) return;

      const ext = f.name.split('.').pop()?.toLowerCase();
      const validExts = ['xlsx', 'xls', 'docx', 'pdf'];

      if (!ext || !validExts.includes(ext)) {
        toast.error('不支持的文件格式', {
          description: '支持 .xlsx, .xls, .docx, .pdf 格式',
        });
        return;
      }

      if (f.size === 0) {
        toast.error('文件为空', {
          description: '请上传包含数据的文件',
        });
        return;
      }

      setFile(f);
    },
    [setFile]
  );

  const { getRootProps, getInputProps, isDragActive, isDragAccept } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  });

  // ========== 删除文件 ==========
  const handleRemoveFile = () => {
    setFile(null);
    setSelectedRule(null);
  };

  // ========== AI 生成规则 ==========
  const handleAiGenerate = async () => {
    if (!file || !fileType) return;

    setAiLoading(true);

    try {
      let fileContent = '';
      let sheetNames: string[] | undefined;
      let totalRows: number | undefined;
      let sampleData: string[][] | undefined;

      if (fileType === 'excel') {
        // 前端解析 Excel 获取预览
        const buffer = await file.arrayBuffer();
        const rawData = parseExcel(buffer);

        if (rawData.sheets && rawData.sheets.length > 0) {
          sheetNames = rawData.sheets.map((s) => s.name);
          const firstSheet = rawData.sheets[0];
          const previewRows = firstSheet.data.slice(0, 20);
          totalRows = firstSheet.data.length;

          // 转为文本格式供 AI 分析
          fileContent = previewRows
            .map((row) => row.map((cell) => String(cell ?? '')).join('\t'))
            .join('\n');

          // 同时提供原始数据样本
          sampleData = previewRows.map((row) =>
            row.map((cell) => String(cell ?? ''))
          );
        }
      } else {
        // Word/PDF 上传到服务端解析
        const formData = new FormData();
        formData.append('file', file);

        const parseRes = await fetch('/api/parse', {
          method: 'POST',
          body: formData,
        });

        if (!parseRes.ok) {
          toast.error('文件解析失败', {
            description: '无法读取文件内容',
          });
          setAiLoading(false);
          return;
        }

        const parseData = await parseRes.json();
        if (parseData.text) {
          const lines = parseData.text.split('\n').slice(0, 20);
          fileContent = lines.join('\n');
          totalRows = parseData.text.split('\n').length;
        }
      }

      if (!fileContent.trim()) {
        toast.error('文件内容为空', {
          description: '无法从文件中读取有效内容',
        });
        setAiLoading(false);
        return;
      }

      // 调用 AI 生成接口
      const res = await fetch('/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileContent,
          fileType,
          sheetNames,
          totalRows,
          sampleData,
        }),
      });

      const result = await res.json();

      if (result.success && result.rule) {
        setAiResult({
          rule: result.rule,
          confidence: result.confidence ?? {},
          explanation: result.explanation ?? '',
        });
        setAiDialogOpen(true);
      } else {
        toast.error('AI生成规则失败', {
          description: result.error || '请尝试手动配置规则',
        });
      }
    } catch (error) {
      toast.error('AI分析异常', {
        description: error instanceof Error ? error.message : '请尝试手动配置规则',
      });
    } finally {
      setAiLoading(false);
    }
  };

  // ========== 保存 AI 生成的规则 ==========
  const handleSaveAiRule = async () => {
    if (!aiResult?.rule) return;

    setAiSaving(true);
    try {
      const ruleToSave: Partial<ParseRule> = {
        ...aiResult.rule,
        fileType: fileType ?? 'excel',
      };

      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleToSave.name || 'AI生成的规则',
          description: ruleToSave.description || aiResult.explanation,
          fileType: ruleToSave.fileType,
          ruleConfig: ruleToSave,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('规则保存成功');
        setAiDialogOpen(false);
        setAiResult(null);
        // 选中刚保存的规则
        if (data.data?.id) {
          setSelectedRule(data.data.id);
        }
        // 刷新规则列表
        loadRules();
      } else {
        toast.error('保存规则失败', {
          description: data.error || '请稍后重试',
        });
      }
    } catch {
      toast.error('保存规则失败');
    } finally {
      setAiSaving(false);
    }
  };

  // ========== 开始解析 ==========
  const handleStartParse = async () => {
    if (!file || !selectedRuleId) return;

    // 查找选中的规则
    const selectedRule = rules.find((r) => r.id === selectedRuleId);
    if (!selectedRule) {
      toast.error('未找到选中的规则');
      return;
    }

    const rule = selectedRule.ruleConfig;

    // 防御性检查: 确保规则配置有效
    if (!rule || typeof rule !== 'object' || (!rule.source && !rule.fieldMapping && !rule.dataRegion)) {
      toast.error('规则配置无效', {
        description: '规则缺少必要的配置信息，请重新生成或编辑规则',
        action: {
          label: '管理规则',
          onClick: () => router.push('/rules'),
        },
      });
      return;
    }
    setParsing(true);
    setParseErrors([]);
    setParseStarting(true);

    // 性能计时
    const perfTimings: Record<string, number> = {};
    const perfStart = performance.now();

    try {
      let rawData;

      if (fileType === 'excel') {
        // Excel 使用 Web Worker 解析
        setParseProgress(10, '正在读取文件...');
        const t0 = performance.now();
        const buffer = await file.arrayBuffer();
        perfTimings['文件读取'] = performance.now() - t0;
        setParseProgress(30, '正在解析Excel数据...');

        const t1 = performance.now();
        rawData = await parseExcelInWorker(buffer);
        perfTimings['Excel解析'] = performance.now() - t1;
        setParseProgress(50, '正在应用规则...');
      } else {
        // Word/PDF 通过服务端解析
        setParseProgress(10, '正在上传文件...');
        const formData = new FormData();
        formData.append('file', file);

        const parseRes = await fetch('/api/parse', {
          method: 'POST',
          body: formData,
        });

        if (!parseRes.ok) {
          throw new Error('文件解析请求失败');
        }

        const parseData = await parseRes.json();
        rawData = parseData;
        setParseProgress(50, '正在应用规则...');
      }

      // 应用规则引擎
      setParseProgress(60, '正在执行规则引擎...');

      const t2 = performance.now();

      // 移除模拟延迟，直接执行规则引擎
      setParseProgress(70, '正在解析数据...');

      const result = ruleEngine.parse(rawData, rule);
      perfTimings['规则引擎'] = performance.now() - t2;

      setParseProgress(95, '正在处理结果...');

      if (result.data.length === 0) {
        setParseProgress(100, '解析完成');
        setParsedData([]);
        const engineErrors = result.errors ?? ['未解析出任何数据'];
        setParseErrors(engineErrors);
        toast.warning('解析结果为空', {
          description: engineErrors[0] || '请检查规则配置是否正确',
          action: {
            label: '管理规则',
            onClick: () => router.push('/rules'),
          },
        });
        return;
      }

      setParseProgress(100, `解析完成: ${result.data.length}条记录`);

      // 输出性能计时
      perfTimings['总耗时'] = performance.now() - perfStart;
      console.group('%c⏱ 性能计时 (不含AI)', 'color: #0fc6c2; font-weight: bold');
      Object.entries(perfTimings).forEach(([key, ms]) => {
        console.log(`  ${key}: ${ms.toFixed(1)}ms`);
      });
      console.groupEnd();

      setParsedData(result.data);

      if (result.errors && result.errors.length > 0) {
        setParseErrors(result.errors);
        toast.warning('解析完成，但存在部分错误', {
          description: result.errors[0],
        });
      }

      // 短暂延迟后跳转
      await new Promise((r) => setTimeout(r, 300));
      router.push('/preview');
    } catch (error) {
      setParseErrors([error instanceof Error ? error.message : '解析失败']);
      toast.error('解析失败', {
        description: error instanceof Error ? error.message : '请检查规则配置',
        action: {
          label: '管理规则',
          onClick: () => router.push('/rules'),
        },
      });
    } finally {
      setParsing(false);
      setParseStarting(false);
    }
  };

  // ========== 根据文件类型过滤规则 ==========
  const filteredRules = fileType
    ? rules.filter((r) => r.fileType === fileType)
    : rules;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">文件导入</h1>
        <p className="mt-1 text-sm text-[#4e5969]">上传文件并选择解析规则</p>
      </div>

      {/* 1. 文件上传区 */}
      {!file ? (
        <div
          {...getRootProps()}
          className={`
            relative flex cursor-pointer flex-col items-center justify-center rounded-xl
            border-2 border-dashed px-6 py-16 transition-all duration-200
            ${
              isDragAccept
                ? 'border-[#0fc6c2] bg-[#e8fafa]'
                : isDragActive
                  ? 'border-[#0fc6c2] bg-[#e8fafa]/50'
                  : 'border-gray-300 bg-gray-50/50 hover:border-[#0fc6c2] hover:bg-[#e8fafa]/30'
            }
          `}
        >
          <input {...getInputProps()} />

          {/* 青绿色 + 图标 */}
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[#e8fafa]">
            <Plus className="size-7 text-[#0fc6c2]" strokeWidth={2.5} />
          </div>

          <p className="text-sm font-medium text-gray-700">
            {isDragActive ? '释放文件以上传' : '点击或拖拽文件上传'}
          </p>
          <p className="mt-1.5 text-xs text-[#4e5969]">
            支持 .xlsx, .xls, .docx, .pdf
          </p>
        </div>
      ) : (
        /* 文件信息展示 */
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-gray-50">
                <FileIcon type={fileType} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{fileName}</p>
                <p className="mt-0.5 text-xs text-[#4e5969]">
                  {formatFileSize(file.size)}
                  {fileType && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-[#e8fafa] px-2 py-0.5 text-[10px] font-medium text-[#0fc6c2]">
                      {fileType.toUpperCase()}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveFile}
              disabled={isParsing}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="size-4" />
              删除
            </Button>
          </div>
        </div>
      )}

      {/* 2. 规则选择区（文件上传后显示） */}
      {file && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-gray-700">解析规则</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* 规则下拉选择 */}
            <Select
              value={selectedRuleId ?? ''}
              onValueChange={(val) => setSelectedRule(val || null)}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder={rulesLoading ? '加载中...' : '选择已有规则'} />
              </SelectTrigger>
              <SelectContent>
                {filteredRules.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-[#4e5969]">
                    暂无匹配规则，请新建或AI生成
                  </div>
                ) : (
                  filteredRules.map((rule) => (
                    <SelectItem key={rule.id} value={rule.id}>
                      {rule.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {/* 新建规则按钮 */}
            <Button
              variant="outline"
              size="default"
              onClick={() => router.push('/rules/new')}
            >
              <Plus className="size-4" />
              新建规则
            </Button>

            {/* AI智能生成按钮 */}
            <Button
              variant="default"
              size="default"
              onClick={handleAiGenerate}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {aiLoading ? 'AI正在分析文件结构...' : 'AI智能生成'}
            </Button>
          </div>
        </div>
      )}

      {/* 3. 解析执行区 */}
      {file && selectedRuleId && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="default"
              size="lg"
              onClick={handleStartParse}
              disabled={isParsing || parseStarting}
              className="bg-[#0fc6c2] hover:bg-[#0bada9] text-white"
            >
              {isParsing || parseStarting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {isParsing ? '正在解析...' : '开始解析'}
            </Button>
          </div>
        </div>
      )}

      {/* 4. 解析进度条 */}
      {isParsing && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <Progress value={parseProgress}>
            <div className="flex w-full items-center justify-between">
              <ProgressLabel className="text-sm text-gray-700">
                {parseStatus || '准备中...'}
              </ProgressLabel>
              <span className="ml-auto text-sm font-medium text-[#0fc6c2] tabular-nums">
                {parseProgress}%
              </span>
            </div>
            <ProgressTrack className="h-2">
              <ProgressIndicator className="bg-[#0fc6c2]" />
            </ProgressTrack>
          </Progress>
        </div>
      )}

      {/* 5. 解析结果摘要（已完成但未跳转时短暂显示） */}
      {!isParsing && parsedData.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">
            解析完成，共 {parsedData.length} 条记录
          </p>
          <p className="mt-1 text-xs text-green-600">正在跳转到预览页面...</p>
        </div>
      )}

      {/* 6. AI 结果对话框 */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>AI生成的解析规则</DialogTitle>
            <DialogDescription>
              {aiResult?.explanation || 'AI已根据文件结构自动生成解析规则'}
            </DialogDescription>
          </DialogHeader>

          {/* 规则概要 */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {aiResult?.rule && (
              <>
                <div className="rounded-lg bg-gray-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#4e5969]">规则名称</span>
                    <span className="text-sm font-medium">
                      {aiResult.rule.name || 'AI生成的规则'}
                    </span>
                  </div>
                  {aiResult.rule.source && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#4e5969]">数据源类型</span>
                      <span className="text-sm font-medium">
                        {aiResult.rule.source.type}
                      </span>
                    </div>
                  )}
                  {aiResult.rule.dataRegion && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#4e5969]">表头行</span>
                      <span className="text-sm font-medium">
                        第 {aiResult.rule.dataRegion.headerRow ?? '-'} 行
                      </span>
                    </div>
                  )}
                </div>

                {/* 字段映射 & 置信度 */}
                {aiResult.rule.fieldMapping && (
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      <p className="text-xs font-medium text-gray-500">字段映射</p>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="size-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px]">
                          百分比表示AI对该字段映射的置信度：绿色(高)表示映射可靠；红色(低/0%)表示原文件中缺少该信息，将使用空值填充，可能需要人工调整。
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(aiResult.rule.fieldMapping).map(
                        ([field, extractor]) => {
                          if (!extractor) return null;
                          const confidence = aiResult.confidence[field];
                          return (
                            <div
                              key={field}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="text-gray-700">{field}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[#4e5969]">
                                  {extractor.type === 'column'
                                    ? `列: ${extractor.column}`
                                    : extractor.type === 'cell'
                                      ? `单元格: ${extractor.cell}`
                                      : extractor.type === 'regex'
                                        ? `正则`
                                        : extractor.type === 'static'
                                          ? `固定值`
                                          : extractor.type}
                                </span>
                                {confidence !== undefined && (
                                  <span
                                    className={`rounded px-1.5 py-0.5 font-medium ${
                                      confidence >= 0.8
                                        ? 'bg-green-100 text-green-700'
                                        : confidence >= 0.5
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {Math.round(confidence * 100)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAiDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleSaveAiRule}
              disabled={aiSaving}
            >
              {aiSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              确认保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
