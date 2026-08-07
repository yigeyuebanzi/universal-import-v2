export const ERROR_CODES = {
  SKU_NOT_FOUND: 'E001',
  REQUIRED_FIELD: 'E002',
  PHONE_FORMAT: 'E003',
  QUANTITY_NOT_POSITIVE: 'E004',
  DUPLICATE_EXTERNAL: 'E005',
  RULE_MAPPING: 'E006',
  DB_WRITE: 'E007',
  FILE_FORMAT: 'E008',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface RowError {
  rowNumber: number;
  fieldName: string;
  rawValue: string;
  errorCode: ErrorCode;
  errorReason: string;
  suggestion?: string;
}

const SENSITIVE_FIELDS = new Set(['receiverPhone', 'receiverAddress', 'phone', 'address']);

export function maskSensitiveValue(fieldName: string, value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (!text) return '';

  if (fieldName === 'receiverPhone' || fieldName === 'phone') {
    if (/^1\d{10}$/.test(text)) {
      return `${text.slice(0, 3)}****${text.slice(-4)}`;
    }
    return text.length <= 4 ? '****' : `${text.slice(0, 2)}****${text.slice(-2)}`;
  }

  if (fieldName === 'receiverAddress' || fieldName === 'address') {
    if (text.length <= 8) return '***';
    return `${text.slice(0, 6)}***${text.slice(-4)}`;
  }

  return text;
}

export function shouldMask(fieldName: string): boolean {
  return SENSITIVE_FIELDS.has(fieldName);
}

export function errorCodeLabel(code: string): string {
  const map: Record<string, string> = {
    E001: 'SKU 不存在',
    E002: '必填字段缺失',
    E003: '电话格式错误',
    E004: '数量不是正数',
    E005: '外部单号重复',
    E006: '规则映射失败',
    E007: '数据库写入失败',
    E008: '文件格式不支持',
  };
  return map[code] ?? code;
}

export function suggestionFor(code: string): string {
  const map: Record<string, string> = {
    E001: '检查 SKU 编码是否存在于商品主数据，修正后重试',
    E002: '补齐缺失的必填字段',
    E003: '填写 11 位中国大陆手机号',
    E004: '数量必须为大于 0 的数字',
    E005: '外部单号已存在，请修改为唯一单号或确认重复导入',
    E006: '检查解析规则字段映射与文件列是否匹配',
    E007: '数据库写入失败，稍后自动重试或联系运维',
    E008: '使用受支持的 .xlsx/.xls/.docx/.pdf 文件',
  };
  return map[code] ?? '检查原始数据后重试';
}
