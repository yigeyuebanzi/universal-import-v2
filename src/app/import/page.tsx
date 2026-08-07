'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, FileText, File, Loader2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

interface RuleItem {
  id: string;
  name: string;
  fileType: string;
  description: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportPage() {
  const router = useRouter();
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  const loadRules = useCallback(async () => {
    const headers: Record<string, string> = {};
    const savedKey = window.sessionStorage.getItem('import_api_key');
    if (savedKey) headers['x-api-key'] = savedKey;
    const res = await fetch('/api/rules', { headers });
    if (res.status === 401) {
      setShowKeyInput(true);
      return;
    }
    if (!res.ok) {
      toast.error('获取规则列表失败');
      return;
    }
    const body = await res.json();
    if (body.success) {
      setRules((body.data ?? []).filter((r: RuleItem) => ['excel', 'word', 'pdf'].includes(r.fileType)));
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['xlsx', 'xls', 'docx', 'pdf'].includes(ext)) {
      toast.error('不支持的文件格式');
      return;
    }
    setFile(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/pdf': ['.pdf'],
    },
  });

  async function handleUpload() {
    if (!file || !selectedRuleId) {
      toast.error('请选择文件和解析规则');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('ruleId', selectedRuleId);
      const headers: Record<string, string> = {};
      const savedKey = window.sessionStorage.getItem('import_api_key');
      if (savedKey) headers['x-api-key'] = savedKey;
      const res = await fetch('/api/import-tasks', { method: 'POST', headers, body: form });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 401) setShowKeyInput(true);
        toast.error(body.error ?? '上传失败');
        return;
      }
      toast.success(`任务已创建，共 ${body.total_batches} 批`);
      router.push(`/tasks/${body.task_id}`);
    } catch {
      toast.error('上传失败，请稍后重试');
    } finally {
      setUploading(false);
    }
  }

  function saveApiKey() {
    if (!apiKey.trim()) return;
    window.sessionStorage.setItem('import_api_key', apiKey.trim());
    setShowKeyInput(false);
    loadRules();
  }

  const FileIcon = file?.name.toLowerCase().endsWith('.xlsx') || file?.name.toLowerCase().endsWith('.xls')
    ? FileSpreadsheet
    : file?.name.toLowerCase().endsWith('.docx')
      ? FileText
      : File;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">文件导入</h1>
      <p className="text-gray-500 mb-6">上传后立即返回 task_id，解析、校验、写库全部在后台异步执行。</p>

      {showKeyInput && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-5">
          <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
            <KeyRound className="w-4 h-4" /> 需要 API Key
          </div>
          <div className="flex gap-2">
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="请输入 IMPORT_API_KEY"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              onClick={saveApiKey}
              className="rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium"
            >
              保存
            </button>
          </div>
        </div>
      )}

      <div
        {...getRootProps()}
        className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-brand bg-brand-light' : 'border-gray-300 hover:border-brand'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-8 h-8 mx-auto text-gray-400 mb-3" />
        {file ? (
          <div>
            <div className="flex items-center justify-center gap-2 font-medium text-gray-800">
              <FileIcon className="w-5 h-5 text-brand" />
              {file.name}
            </div>
            <div className="text-sm text-gray-400 mt-1">{formatBytes(file.size)}</div>
            <div className="text-xs text-gray-400 mt-2">点击或拖拽可重新选择</div>
          </div>
        ) : (
          <div>
            <div className="font-medium text-gray-700">拖拽文件到此处，或点击选择</div>
            <div className="text-sm text-gray-400 mt-1">支持 .xlsx / .xls / .docx / .pdf</div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">解析规则</label>
        <select
          value={selectedRuleId}
          onChange={(e) => setSelectedRuleId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white"
        >
          <option value="">请选择规则</option>
          {rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}（{r.fileType}）
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleUpload}
        disabled={uploading || !file || !selectedRuleId}
        className="mt-6 w-full rounded-lg bg-brand text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? '创建任务中...' : '上传并创建异步任务'}
      </button>
    </div>
  );
}
