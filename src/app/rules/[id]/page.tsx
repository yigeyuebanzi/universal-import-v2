'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Sparkles, Upload, ChevronDown, ChevronRight,
  Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import type { ParseRule, FieldExtractor, RawFileData, ParsedRecord } from '@/lib/rules/types';

// ============ 常量 ============

const FIELD_MAPPING_KEYS: { key: keyof NonNullable<ParseRule['fieldMapping']>; label: string }[] = [
  { key: 'externalCode', label: '外部编码' },
  { key: 'storeName', label: '门店名称' },
  { key: 'receiverName', label: '收件人' },
  { key: 'receiverPhone', label: '联系电话' },
  { key: 'receiverAddress', label: '收货地址' },
  { key: 'skuCode', label: 'SKU编码' },
  { key: 'skuName', label: 'SKU名称' },
  { key: 'skuQuantity', label: '发货数量' },
  { key: 'skuSpec', label: '规格型号' },
  { key: 'remark', label: '备注' },
];

const EXTRACTOR_TYPES = [
  { value: 'column', label: '列(column)' },
  { value: 'cell', label: '单元格(cell)' },
  { value: 'regex', label: '正则(regex)' },
  { value: 'static', label: '静态(static)' },
];

const SOURCE_TYPES = [
  { value: 'table', label: '标准表格' },
  { value: 'text', label: '纯文本' },
  { value: 'matrix', label: '矩阵转置' },
  { value: 'card', label: '卡片式' },
  { value: 'multi-sheet', label: '多Sheet合并' },
];

const FILE_TYPES = [
  { value: 'excel', label: 'Excel' },
  { value: 'word', label: 'Word' },
  { value: 'pdf', label: 'PDF' },
];

// ============ 辅助函数 ============

function createEmptyRule(): Partial<ParseRule> {
  return {
    name: '',
    description: '',
    fileType: 'excel',
    source: { type: 'table' },
    dataRegion: {
      headerRow: 1,
      dataStartRow: 2,
      dataEndRow: 'auto',
      skipPatterns: [],
    },
    fieldMapping: {},
    postProcessing: {
      trimWhitespace: true,
      removeEmptyRows: true,
    },
  };
}

function getExtractor(fieldMapping: Partial<Record<string, FieldExtractor>>, key: string): FieldExtractor {
  return (fieldMapping as Record<string, FieldExtractor | undefined>)?.[key] ?? { type: 'column', column: '' };
}

function updateExtractor(
  fieldMapping: Partial<Record<string, FieldExtractor>>,
  key: string,
  updates: Partial<FieldExtractor>
): Record<string, FieldExtractor> {
  const current = getExtractor(fieldMapping, key);
  const updated = { ...current, ...updates };
  return { ...(fieldMapping as Record<string, FieldExtractor>), [key]: updated };
}

// ============ 主组件 ============

export default function RuleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ruleId = params.id as string;
  const isNew = ruleId === 'new';

  // 表单状态
  const [rule, setRule] = useState<Partial<ParseRule>>(createEmptyRule);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [activeTab, setActiveTab] = useState<string>('visual');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // 高级选项折叠
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // AI生成
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiRecommended, setAiRecommended] = useState(false);

  // 试解析
  const [parseFile, setParseFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<{ success: boolean; data: ParsedRecord[]; errors?: string[]; totalRows?: number; parsedRows?: number } | null>(null);

  // 加载已有规则
  const fetchRule = useCallback(async () => {
    if (isNew) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/rules/${ruleId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      // 数据库返回的规则: { id, name, description, fileType, ruleConfig, ... }
      const config = (data.ruleConfig || {}) as Partial<ParseRule>;
      setRule({
        id: data.id,
        name: data.name,
        description: data.description,
        fileType: data.fileType,
        ...config,
      });
      setJsonText(JSON.stringify(config, null, 2));
    } catch {
      toast.error('加载规则失败');
    } finally {
      setLoading(false);
    }
  }, [ruleId, isNew]);

  useEffect(() => {
    fetchRule();
  }, [fetchRule]);

  // 同步规则到 JSON 文本
  useEffect(() => {
    if (activeTab === 'visual') {
      const config = buildRuleConfig();
      setJsonText(JSON.stringify(config, null, 2));
      setJsonError('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // 从表单状态构建 ruleConfig
  const buildRuleConfig = (): Partial<ParseRule> => {
    const config: Partial<ParseRule> = {
      source: rule.source,
      dataRegion: rule.dataRegion,
      fieldMapping: rule.fieldMapping,
      postProcessing: rule.postProcessing,
    };
    if (rule.aggregation) config.aggregation = rule.aggregation;
    if (rule.matrixTranspose) config.matrixTranspose = rule.matrixTranspose;
    if (rule.cardParsing) config.cardParsing = rule.cardParsing;
    if (rule.textParsing) config.textParsing = rule.textParsing;
    if (rule.cellSplitting) config.cellSplitting = rule.cellSplitting;
    if (rule.metadataExtraction) config.metadataExtraction = rule.metadataExtraction;
    return config;
  };

  // 保存
  const handleSave = async () => {
    if (!rule.name?.trim()) {
      toast.error('请输入规则名称');
      return;
    }

    try {
      setSaving(true);
      const config = activeTab === 'json' ? parseJsonText() : buildRuleConfig();
      if (!config) return;

      const payload = {
        name: rule.name,
        description: rule.description || null,
        fileType: rule.fileType,
        ruleConfig: config,
      };

      if (isNew) {
        const res = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        const created = await res.json();
        toast.success('规则创建成功');
        const createdId = created.data?.id || created.id;
        router.replace(`/rules/${createdId}`);
      } else {
        const res = await fetch(`/api/rules/${ruleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        toast.success('规则保存成功');
        fetchRule();
      }
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 从 JSON 文本解析
  const parseJsonText = (): Partial<ParseRule> | null => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonError('');
      return parsed;
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'JSON格式错误');
      toast.error('JSON格式错误，请检查');
      return null;
    }
  };

  // 从 JSON 编辑器应用到表单
  const applyJsonToForm = () => {
    const config = parseJsonText();
    if (!config) return;
    setRule(prev => ({ ...prev, ...config }));
    toast.success('已从JSON同步到表单');
  };

  // AI生成规则
  const handleAiGenerate = async () => {
    if (!aiFile) {
      toast.error('请先上传样本文件');
      return;
    }

    try {
      setAiGenerating(true);

      // 读取文件内容
      const arrayBuffer = await aiFile.arrayBuffer();
      let fileContent = '';
      let sampleData: string[][] = [];
      let sheetNames: string[] = [];
      let totalRows = 0;

      if (rule.fileType === 'excel' || aiFile.name.endsWith('.xlsx') || aiFile.name.endsWith('.xls')) {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        sheetNames = workbook.SheetNames;
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<(string | number | null)[]>(firstSheet, { header: 1 });
        totalRows = jsonData.length;
        sampleData = jsonData.slice(0, 20).map(row =>
          row.map(cell => cell === null || cell === undefined ? '' : String(cell))
        );
        fileContent = sampleData.map(row => row.join('\t')).join('\n');
      } else {
        // 对于非Excel文件，读取为文本
        fileContent = new TextDecoder().decode(arrayBuffer).slice(0, 5000);
      }

      const res = await fetch('/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileContent,
          fileType: rule.fileType,
          sheetNames,
          totalRows,
          sampleData,
        }),
      });

      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || 'AI生成失败');
      }

      // 将AI生成的规则应用到表单
      const aiRule = result.rule as Partial<ParseRule>;
      setRule(prev => ({
        ...prev,
        ...aiRule,
        name: prev.name || aiRule.name || '',
        description: prev.description || aiRule.description || '',
        fileType: prev.fileType || aiRule.fileType || 'excel',
      }));

      setAiRecommended(true);
      setAiDialogOpen(false);
      setAiFile(null);
      toast.success('AI规则生成成功', {
        description: result.explanation || '已将规则配置填充到表单',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI生成失败');
    } finally {
      setAiGenerating(false);
    }
  };

  // 试解析
  const handleParse = async () => {
    if (!parseFile) {
      toast.error('请先上传试解析文件');
      return;
    }

    try {
      setParsing(true);
      setParseResult(null);

      // 读取文件为原始数据
      const arrayBuffer = await parseFile.arrayBuffer();
      let rawData: RawFileData;

      if (rule.fileType === 'excel' || parseFile.name.endsWith('.xlsx') || parseFile.name.endsWith('.xls')) {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheets = workbook.SheetNames.map(name => {
          const sheet = workbook.Sheets[name];
          const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });
          return { name, data };
        });
        rawData = { type: 'excel', sheets };
      } else {
        const text = new TextDecoder().decode(arrayBuffer);
        rawData = { type: rule.fileType as 'word' | 'pdf', text };
      }

      const config = activeTab === 'json' ? parseJsonText() : buildRuleConfig();
      if (!config) return;

      const fullRule: ParseRule = {
        id: 'temp',
        name: rule.name || '',
        fileType: rule.fileType as ParseRule['fileType'],
        source: config.source ?? { type: 'table' },
        ...config,
      };

      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleConfig: fullRule, rawData }),
      });

      const result = await res.json();
      setParseResult(result);
      if (result.success) {
        toast.success(`解析成功，共 ${result.totalRows} 条记录`);
      } else {
        toast.error('解析失败', { description: result.errors?.join('; ') });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '试解析失败');
    } finally {
      setParsing(false);
    }
  };

  // ============ 渲染 ============

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[#4e5969]">
        <Loader2 className="size-5 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/rules')} className="text-[#4e5969] hover:text-gray-900 transition-colors">
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {isNew ? '新增规则' : '编辑规则'}
            </h1>
            {aiRecommended && (
              <Badge variant="secondary" className="mt-1 text-xs">
                <Sparkles className="size-3" />
                AI推荐
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.push('/rules')}>
            取消
          </Button>
          <Button className="bg-brand hover:bg-brand-dark text-white" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存
          </Button>
        </div>
      </div>

      {/* A) 基础信息区 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">基础信息</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#4e5969]">规则名称 <span className="text-red-500">*</span></label>
            <Input
              value={rule.name || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRule(prev => ({ ...prev, name: e.target.value }))}
              placeholder="请输入规则名称"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#4e5969]">文件类型</label>
            <Select
              value={rule.fileType || 'excel'}
              onValueChange={(val) => setRule(prev => ({ ...prev, fileType: val as ParseRule['fileType'] }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_TYPES.map(ft => (
                  <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#4e5969]">描述</label>
            <Input
              value={rule.description || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRule(prev => ({ ...prev, description: e.target.value }))}
              placeholder="规则描述（可选）"
            />
          </div>
        </div>
      </div>

      {/* B) 规则配置区（双模式切换） */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">规则配置</h2>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="line">
            <TabsTrigger value="visual">可视化配置</TabsTrigger>
            <TabsTrigger value="json">JSON编辑器</TabsTrigger>
          </TabsList>

          {/* Tab1: 可视化配置 */}
          <TabsContent value="visual" className="mt-4 space-y-5">
            {/* 数据源类型 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#4e5969]">数据源类型</label>
              <Select
                value={rule.source?.type || 'table'}
                onValueChange={(val) => setRule(prev => ({
                  ...prev,
                  source: { ...prev.source, type: val as ParseRule['source']['type'] },
                }))}
              >
                <SelectTrigger className="w-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map(st => (
                    <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 数据区域 */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#4e5969]">数据区域</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-[#86909c]">表头行号</label>
                  <Input
                    type="number"
                    min={1}
                    value={rule.dataRegion?.headerRow ?? 1}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRule(prev => ({
                      ...prev,
                      dataRegion: { ...prev.dataRegion, headerRow: parseInt(e.target.value) || 1 },
                    }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#86909c]">数据起始行</label>
                  <Input
                    type="number"
                    min={1}
                    value={rule.dataRegion?.dataStartRow ?? 2}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRule(prev => ({
                      ...prev,
                      dataRegion: { ...prev.dataRegion, dataStartRow: parseInt(e.target.value) || 2 },
                    }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#86909c]">数据结束行</label>
                  <Input
                    value={rule.dataRegion?.dataEndRow ?? 'auto'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value;
                      setRule(prev => ({
                        ...prev,
                        dataRegion: {
                          ...prev.dataRegion,
                          dataEndRow: val === 'auto' ? 'auto' : (parseInt(val) || 'auto') as number | 'auto',
                        },
                      }));
                    }}
                    placeholder="auto 或行号"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#86909c]">跳过模式(逗号分隔)</label>
                  <Input
                    value={(rule.dataRegion?.skipPatterns ?? []).join(',')}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRule(prev => ({
                      ...prev,
                      dataRegion: {
                        ...prev.dataRegion,
                        skipPatterns: e.target.value ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : [],
                      },
                    }))}
                    placeholder="合计,总计"
                  />
                </div>
              </div>
            </div>

            {/* 字段映射 */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#4e5969]">字段映射</h3>
              <div className="space-y-2">
                {FIELD_MAPPING_KEYS.map(({ key, label }) => {
                  const extractor = getExtractor(rule.fieldMapping ?? {}, key);
                  return (
                    <div key={key} className="grid grid-cols-[120px_140px_1fr] gap-3 items-center">
                      <span className="text-xs text-[#4e5969] truncate" title={label}>{label}</span>
                      <Select
                        value={extractor.type}
                        onValueChange={(val) => setRule(prev => ({
                          ...prev,
                          fieldMapping: updateExtractor(prev.fieldMapping ?? {}, key, {
                            type: val as FieldExtractor['type'],
                            // Reset irrelevant fields
                            column: val === 'column' ? (extractor.column ?? '') : undefined,
                            cell: val === 'cell' ? (extractor.cell ?? '') : undefined,
                            regex: val === 'regex' ? (extractor.regex ?? '') : undefined,
                            staticValue: val === 'static' ? (extractor.staticValue ?? '') : undefined,
                          }),
                        }))}
                      >
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXTRACTOR_TYPES.map(et => (
                            <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {extractor.type === 'column' && (
                        <Input
                          className="h-8 text-xs"
                          value={extractor.column ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRule(prev => ({
                            ...prev,
                            fieldMapping: updateExtractor(prev.fieldMapping ?? {}, key, {
                              column: e.target.value,
                            }),
                          }))}
                          placeholder="列名或列索引(0-based)"
                        />
                      )}
                      {extractor.type === 'cell' && (
                        <Input
                          className="h-8 text-xs"
                          value={extractor.cell ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRule(prev => ({
                            ...prev,
                            fieldMapping: updateExtractor(prev.fieldMapping ?? {}, key, {
                              cell: e.target.value,
                            }),
                          }))}
                          placeholder="如 B9"
                        />
                      )}
                      {extractor.type === 'regex' && (
                        <Input
                          className="h-8 text-xs"
                          value={extractor.regex ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRule(prev => ({
                            ...prev,
                            fieldMapping: updateExtractor(prev.fieldMapping ?? {}, key, {
                              regex: e.target.value,
                            }),
                          }))}
                          placeholder="正则表达式"
                        />
                      )}
                      {extractor.type === 'static' && (
                        <Input
                          className="h-8 text-xs"
                          value={extractor.staticValue ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRule(prev => ({
                            ...prev,
                            fieldMapping: updateExtractor(prev.fieldMapping ?? {}, key, {
                              staticValue: e.target.value,
                            }),
                          }))}
                          placeholder="静态值"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 高级选项（可折叠） */}
            <div className="border-t border-gray-100 pt-3">
              <button
                className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-dark transition-colors"
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                {advancedOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                高级选项
              </button>
              {advancedOpen && (
                <div className="mt-3 space-y-4">
                  {/* 后处理 */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-[#4e5969]">后处理</h4>
                    <div className="flex items-center gap-6">
                      <label className="inline-flex items-center gap-2 text-xs text-[#4e5969]">
                        <input
                          type="checkbox"
                          checked={rule.postProcessing?.trimWhitespace ?? true}
                          onChange={(e) => setRule(prev => ({
                            ...prev,
                            postProcessing: { ...prev.postProcessing, trimWhitespace: e.target.checked },
                          }))}
                          className="rounded border-gray-300"
                        />
                        去除空白
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-[#4e5969]">
                        <input
                          type="checkbox"
                          checked={rule.postProcessing?.removeEmptyRows ?? true}
                          onChange={(e) => setRule(prev => ({
                            ...prev,
                            postProcessing: { ...prev.postProcessing, removeEmptyRows: e.target.checked },
                          }))}
                          className="rounded border-gray-300"
                        />
                        移除空行
                      </label>
                    </div>
                  </div>
                  {/* 聚合 */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-[#4e5969]">聚合规则</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-[#86909c]">聚合字段(groupBy)</label>
                        <Input
                          className="h-8 text-xs"
                          value={rule.aggregation?.groupBy ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRule(prev => ({
                            ...prev,
                            aggregation: e.target.value
                              ? { groupBy: e.target.value, sharedFields: prev.aggregation?.sharedFields ?? [] }
                              : undefined,
                          }))}
                          placeholder="如 externalCode"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-[#86909c]">共享字段(逗号分隔)</label>
                        <Input
                          className="h-8 text-xs"
                          value={(rule.aggregation?.sharedFields ?? []).join(',')}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const fields = e.target.value ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : [];
                            setRule(prev => ({
                              ...prev,
                              aggregation: prev.aggregation
                                ? { ...prev.aggregation, sharedFields: fields }
                                : undefined,
                            }));
                          }}
                          placeholder="如 storeName,receiverName"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tab2: JSON编辑器 */}
          <TabsContent value="json" className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={applyJsonToForm}>
                同步到表单
              </Button>
              <span className="text-xs text-[#86909c]">编辑JSON后点击同步到可视化表单</span>
            </div>
            <Textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                try {
                  JSON.parse(e.target.value);
                  setJsonError('');
                } catch (err) {
                  setJsonError(err instanceof Error ? err.message : 'JSON格式错误');
                }
              }}
              className="font-mono text-xs min-h-[400px] resize-y"
              placeholder="在此编辑规则JSON配置..."
            />
            {jsonError && (
              <p className="text-xs text-red-500">{jsonError}</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* C) AI生成规则区 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">AI智能生成</h2>
          <Button
            variant="outline"
            className="text-brand border-brand hover:bg-brand-light"
            onClick={() => setAiDialogOpen(true)}
          >
            <Sparkles className="size-4" />
            AI分析生成
          </Button>
        </div>
        <p className="text-xs text-[#86909c]">
          上传样本文件，AI将自动分析文件结构并生成解析规则配置
        </p>
      </div>

      {/* D) 试解析预览区 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">试解析预览</h2>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <Input
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv,.pdf,.doc,.docx"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setParseFile(e.target.files?.[0] ?? null);
                  setParseResult(null);
                }}
              />
              <span className="text-xs text-[#4e5969] px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                {parseFile ? parseFile.name : '选择文件'}
              </span>
            </label>
            <Button
              className="bg-brand hover:bg-brand-dark text-white"
              onClick={handleParse}
              disabled={!parseFile || parsing}
            >
              {parsing ? <Loader2 className="size-4 animate-spin" /> : null}
              试解析
            </Button>
          </div>
        </div>

        {parseResult && (
          <div className="space-y-3">
            {/* 状态 */}
            <div className="flex items-center gap-2">
              {parseResult.success ? (
                <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="size-3" />
                  解析成功 · 共 {parseResult.totalRows} 条 · 有效 {parseResult.parsedRows} 条
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs">
                  <XCircle className="size-3" />
                  解析失败
                </Badge>
              )}
            </div>

            {/* 错误信息 */}
            {parseResult.errors && parseResult.errors.length > 0 && (
              <div className="text-xs text-red-500 bg-red-50 rounded-lg p-3">
                {parseResult.errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}

            {/* 预览表格 */}
            {parseResult.data.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead className="text-xs font-medium text-[#4e5969] w-10">#</TableHead>
                      {Object.keys(parseResult.data[0])
                        .filter(k => !k.startsWith('_'))
                        .map(key => (
                          <TableHead key={key} className="text-xs font-medium text-[#4e5969]">
                            {key}
                          </TableHead>
                        ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parseResult.data.slice(0, 10).map((record, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-[#86909c]">{i + 1}</TableCell>
                        {Object.entries(record)
                          .filter(([k]) => !k.startsWith('_'))
                          .map(([key, val]) => (
                            <TableCell key={key} className="text-xs text-gray-900 max-w-[200px] truncate">
                              {val === null || val === undefined ? '' : String(val)}
                            </TableCell>
                          ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parseResult.data.length > 10 && (
                  <div className="text-center py-2 text-xs text-[#86909c] border-t">
                    仅展示前10条，共 {parseResult.data.length} 条
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* E) 保存操作（底部固定） */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-200 -mx-6 -mb-6 px-6 py-4 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => router.push('/rules')}>
          取消
        </Button>
        <Button className="bg-brand hover:bg-brand-dark text-white" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          保存
        </Button>
      </div>

      {/* AI生成 Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>AI分析生成规则</DialogTitle>
            <DialogDescription>
              上传样本文件，AI将自动分析文件结构并生成解析规则
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#4e5969]">样本文件</label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-brand transition-colors">
                <Input
                  type="file"
                  className="hidden"
                  id="ai-file-input"
                  accept=".xlsx,.xls,.csv,.pdf,.doc,.docx"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiFile(e.target.files?.[0] ?? null)}
                />
                <label htmlFor="ai-file-input" className="cursor-pointer">
                  {aiFile ? (
                    <div className="text-sm text-gray-900">{aiFile.name}</div>
                  ) : (
                  <>
                    <Upload className="size-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-[#4e5969]">点击上传样本文件</p>
                    <p className="text-xs text-[#86909c] mt-1">支持 xlsx, xls, csv, pdf, doc, docx</p>
                  </>
                )}
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              取消
            </DialogClose>
            <Button
              className="bg-brand hover:bg-brand-dark text-white"
              onClick={handleAiGenerate}
              disabled={!aiFile || aiGenerating}
            >
              {aiGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {aiGenerating ? '生成中...' : '开始生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
