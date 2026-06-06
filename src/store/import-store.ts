import { create } from 'zustand';
import type { ParsedRecord } from '@/lib/rules/types';

/** 行级错误: rowIndex -> { fieldName -> errorMessage } */
export type ErrorMap = Record<number, Record<string, string>>;

/** 批内重复编码: code -> rowIndices */
export type DuplicateCodeMap = Record<string, number[]>;

interface ImportState {
  // ---- 导入页状态 ----
  file: File | null;
  fileName: string | null;
  fileType: 'excel' | 'word' | 'pdf' | null;
  selectedRuleId: string | null;
  isParsing: boolean;
  parseProgress: number;
  parseStatus: string | null;
  parseErrors: string[];

  // ---- 预览页状态 ----
  /** 预览数据 */
  parsedData: ParsedRecord[];
  /** 行级校验错误 */
  errors: ErrorMap;
  /** 选中行索引 */
  selectedRows: Set<number>;
  /** 批内重复编码 */
  duplicateCodes: DuplicateCodeMap;
  /** 与数据库重复的行索引 */
  dbDuplicateRows: Set<number>;

  // ---- 导入页 Actions ----
  setFile: (file: File | null) => void;
  setSelectedRule: (id: string | null) => void;
  setParsing: (v: boolean) => void;
  setParseProgress: (progress: number, status?: string) => void;
  setParseErrors: (errors: string[]) => void;
  reset: () => void;

  // ---- 预览页 Actions ----
  setParsedData: (data: ParsedRecord[]) => void;
  updateCell: (rowIndex: number, field: string, value: string | number) => void;
  addRow: () => void;
  deleteRows: (indices: number[]) => void;
  validateRow: (rowIndex: number) => Record<string, string>;
  validateAll: () => void;
  toggleRowSelection: (index: number) => void;
  selectAllRows: () => void;
  clearSelection: () => void;
  checkDuplicateCodes: () => void;
  setDbDuplicateRows: (rows: Set<number>) => void;
  getErrorCount: () => number;
  getErrorList: () => Array<{ rowIndex: number; field: string; message: string }>;
}

/** 单行校验逻辑 */
function validateRecord(record: ParsedRecord): Record<string, string> {
  const errors: Record<string, string> = {};

  // ---- A/B 组必填校验 ----
  const hasAGroup = !!record.storeName?.trim();
  const hasBGroup = !!(
    record.receiverName?.trim() &&
    record.receiverPhone?.trim() &&
    record.receiverAddress?.trim()
  );

  if (!hasAGroup && !hasBGroup) {
    if (!record.storeName?.trim())
      errors.storeName = '门店名称必填（或填写完整收件人信息）';
    if (!record.receiverName?.trim())
      errors.receiverName = '收件人姓名必填（或填写门店名称）';
    if (!record.receiverPhone?.trim())
      errors.receiverPhone = '收件人电话必填（或填写门店名称）';
    if (!record.receiverAddress?.trim())
      errors.receiverAddress = '收件人地址必填（或填写门店名称）';
  }

  // ---- 始终必填 ----
  if (!record.skuCode?.trim()) errors.skuCode = 'SKU编码必填';
  if (!record.skuName?.trim()) errors.skuName = 'SKU名称必填';

  const qty = Number(record.skuQuantity);
  if (record.skuQuantity === undefined || record.skuQuantity === null || record.skuQuantity === '') {
    errors.skuQuantity = 'SKU数量必填';
  } else if (isNaN(qty) || qty <= 0) {
    errors.skuQuantity = 'SKU数量必须为正数';
  }

  // ---- 格式校验 ----
  if (record.receiverPhone?.trim()) {
    const phone = record.receiverPhone.trim();
    const mobileReg = /^1\d{10}$/;
    const landlineReg = /^\d{3,4}-?\d{7,8}$/;
    if (!mobileReg.test(phone) && !landlineReg.test(phone)) {
      errors.receiverPhone = errors.receiverPhone
        ? errors.receiverPhone + '；电话格式不正确'
        : '电话格式不正确（需11位手机号或座机格式）';
    }
  }

  return errors;
}

const initialState = {
  file: null as File | null,
  fileName: null as string | null,
  fileType: null as 'excel' | 'word' | 'pdf' | null,
  selectedRuleId: null as string | null,
  isParsing: false,
  parseProgress: 0,
  parseStatus: null as string | null,
  parseErrors: [] as string[],
  parsedData: [] as ParsedRecord[],
  errors: {} as ErrorMap,
  selectedRows: new Set<number>(),
  duplicateCodes: {} as DuplicateCodeMap,
  dbDuplicateRows: new Set<number>(),
};

export const useImportStore = create<ImportState>((set, get) => ({
  ...initialState,

  // ---- 导入页 Actions ----
  setFile: (file) => {
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let fileType: 'excel' | 'word' | 'pdf' | null = null;
      if (ext === 'xlsx' || ext === 'xls') fileType = 'excel';
      else if (ext === 'docx') fileType = 'word';
      else if (ext === 'pdf') fileType = 'pdf';
      set({ file, fileName: file.name, fileType });
    } else {
      set({ file: null, fileName: null, fileType: null });
    }
  },

  setSelectedRule: (id) => set({ selectedRuleId: id }),

  setParsing: (v) => set({ isParsing: v }),

  setParseProgress: (progress, status) =>
    set({ parseProgress: progress, parseStatus: status ?? null }),

  setParseErrors: (errors) => set({ parseErrors: errors }),

  reset: () => set(initialState),

  // ---- 预览页 Actions ----
  setParsedData: (data) => {
    // 先设置数据，再异步执行校验和重复检测（避免阻塞UI）
    set({ parsedData: data });
    // 使用 requestIdleCallback 分批校验，避免1000条数据一次性校验卡顿
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        get().validateAll();
        get().checkDuplicateCodes();
      }, { timeout: 200 });
    } else {
      setTimeout(() => {
        get().validateAll();
        get().checkDuplicateCodes();
      }, 0);
    }
  },

  updateCell: (rowIndex, field, value) => {
    set((state) => {
      const newData = [...state.parsedData];
      newData[rowIndex] = { ...newData[rowIndex], [field]: value };
      return { parsedData: newData };
    });
    get().validateRow(rowIndex);
    if (field === 'externalCode') {
      get().checkDuplicateCodes();
    }
  },

  addRow: () => {
    set((state) => {
      const newRow: ParsedRecord = {
        _rowIndex: state.parsedData.length + 1,
      };
      return { parsedData: [...state.parsedData, newRow] };
    });
  },

  deleteRows: (indices) => {
    set((state) => {
      const indexSet = new Set(indices);
      const newData = state.parsedData
        .filter((_, i) => !indexSet.has(i))
        .map((row, i) => ({ ...row, _rowIndex: i + 1 }));
      return {
        parsedData: newData,
        errors: {},
        selectedRows: new Set<number>(),
      };
    });
    get().validateAll();
    get().checkDuplicateCodes();
  },

  validateRow: (rowIndex) => {
    const state = get();
    const record = state.parsedData[rowIndex];
    if (!record) return {};
    const rowErrors = validateRecord(record);
    set((state) => {
      const newErrors = { ...state.errors };
      if (Object.keys(rowErrors).length > 0) {
        newErrors[rowIndex] = rowErrors;
      } else {
        delete newErrors[rowIndex];
      }
      return { errors: newErrors };
    });
    return rowErrors;
  },

  validateAll: () => {
    const state = get();
    const newErrors: ErrorMap = {};
    const data = state.parsedData;
    for (let i = 0, len = data.length; i < len; i++) {
      const rowErrors = validateRecord(data[i]);
      if (Object.keys(rowErrors).length > 0) {
        newErrors[i] = rowErrors;
      }
    }
    set({ errors: newErrors });
  },

  toggleRowSelection: (index) => {
    set((state) => {
      const newSelection = new Set(state.selectedRows);
      if (newSelection.has(index)) {
        newSelection.delete(index);
      } else {
        newSelection.add(index);
      }
      return { selectedRows: newSelection };
    });
  },

  selectAllRows: () => {
    set((state) => ({
      selectedRows: new Set(state.parsedData.map((_, i) => i)),
    }));
  },

  clearSelection: () => {
    set({ selectedRows: new Set<number>() });
  },

  checkDuplicateCodes: () => {
    const state = get();
    const codeMap: Record<string, number[]> = {};
    const data = state.parsedData;
    for (let i = 0, len = data.length; i < len; i++) {
      const code = data[i].externalCode?.trim();
      if (code) {
        if (!codeMap[code]) codeMap[code] = [];
        codeMap[code].push(i);
      }
    }
    const duplicates: DuplicateCodeMap = {};
    const entries = Object.entries(codeMap);
    for (let i = 0, len = entries.length; i < len; i++) {
      const [code, indices] = entries[i];
      if (indices.length > 1) {
        duplicates[code] = indices;
      }
    }
    set({ duplicateCodes: duplicates });
  },

  setDbDuplicateRows: (rows) => {
    set({ dbDuplicateRows: rows });
  },

  getErrorCount: () => {
    const errors = get().errors;
    let count = 0;
    const vals = Object.values(errors);
    for (let i = 0, len = vals.length; i < len; i++) {
      count += Object.keys(vals[i]).length;
    }
    return count;
  },

  getErrorList: () => {
    const errors = get().errors;
    const list: Array<{ rowIndex: number; field: string; message: string }> = [];
    const entries = Object.entries(errors);
    for (let i = 0, len = entries.length; i < len; i++) {
      const [idx, errs] = entries[i];
      const errEntries = Object.entries(errs);
      for (let j = 0, jlen = errEntries.length; j < jlen; j++) {
        const [field, message] = errEntries[j];
        list.push({ rowIndex: Number(idx), field, message });
      }
    }
    return list;
  },
}));
