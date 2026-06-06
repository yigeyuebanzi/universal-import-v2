// ============================================================
// 规则引擎类型定义 - 通用导入系统
// 所有解析逻辑完全由规则JSON配置驱动，代码中禁止硬编码列名
// ============================================================

/** 字段提取器 - 定义如何从原始数据中提取单个字段值 */
export interface FieldExtractor {
  /** 提取方式 */
  type: 'column' | 'cell' | 'regex' | 'static' | 'formula';
  /** 列索引(0-based数字)或列名(字符串，通过headerRow匹配) */
  column?: number | string;
  /** 固定单元格位置(如 "B9") */
  cell?: string;
  /** 正则表达式 */
  regex?: string;
  /** 正则捕获组(默认1) */
  regexGroup?: number;
  /** 静态值 */
  staticValue?: string;
  /** 组合公式(预留扩展) */
  formula?: string;
}

/** 元数据提取区域 - 从非数据区提取散落字段 */
export interface MetadataRegion {
  /** 目标字段名 */
  targetField: string;
  /** 搜索区域 */
  searchArea: 'header' | 'footer' | 'specific-row' | 'all';
  /** 行号(1-based)，配合 specific-row 使用 */
  row?: number;
  /** 列号(0-based) */
  column?: number;
  /** 正则提取 */
  regex?: string;
  /** 搜索包含此文本的行 */
  searchPattern?: string;
}

/** 完整解析规则 */
export interface ParseRule {
  /** 规则唯一标识 */
  id: string;
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description?: string;
  /** 文件类型 */
  fileType: 'excel' | 'word' | 'pdf';
  /** 创建时间 */
  createdAt?: string;
  /** 更新时间 */
  updatedAt?: string;

  // ---- 数据源配置 ----
  source: {
    /** 数据源类型，决定解析策略 */
    type: 'table' | 'text' | 'matrix' | 'card' | 'multi-sheet';
    /** Sheet配置(仅Excel) */
    sheetConfig?: {
      /** Sheet索引(0-based) */
      sheetIndex?: number;
      /** 是否解析所有Sheet */
      allSheets?: boolean;
      /** Sheet名称匹配正则 */
      sheetNamePattern?: string;
    };
  };

  // ---- 数据区域定位 ----
  dataRegion?: {
    /** 表头行号(1-based) */
    headerRow?: number;
    /** 数据起始行(1-based) */
    dataStartRow?: number;
    /** 数据结束行(1-based数字 或 'auto'自动检测) */
    dataEndRow?: number | 'auto';
    /** 跳过指定行号(1-based) */
    skipRows?: number[];
    /** 跳过包含特定文本的行(如"合计","总计") */
    skipPatterns?: string[];
  };

  // ---- 字段映射 ----
  fieldMapping?: {
    externalCode?: FieldExtractor;
    storeName?: FieldExtractor;
    receiverName?: FieldExtractor;
    receiverPhone?: FieldExtractor;
    receiverAddress?: FieldExtractor;
    skuCode?: FieldExtractor;
    skuName?: FieldExtractor;
    skuQuantity?: FieldExtractor;
    skuSpec?: FieldExtractor;
    remark?: FieldExtractor;
  };

  // ---- 聚合规则(跨行聚合) ----
  aggregation?: {
    /** 按哪个字段聚合 */
    groupBy: string;
    /** 共享字段列表(聚合时取第一条的值) */
    sharedFields: string[];
  };

  // ---- 矩阵转置 ----
  matrixTranspose?: {
    /** 固定列索引(0-based) */
    fixedColumns: number[];
    /** 转置开始列(0-based) */
    transposeStartCol: number;
    /** 列头所在行(1-based) */
    transposeHeaderRow: number;
    /** 值映射到哪个字段(如 skuQuantity) */
    valueField: string;
    /** 列头映射到哪个字段(如 storeName) */
    headerField: string;
    /** 跳过空值单元格 */
    skipEmptyValues?: boolean;
  };

  // ---- 卡片式解析 ----
  cardParsing?: {
    /** 卡片起始标志(正则) */
    cardStartPattern: string;
    /** 卡片结束标志(可选正则) */
    cardEndPattern?: string;
    /** 卡片内元信息正则 { fieldName: regex } */
    metadataPatterns?: Record<string, string>;
    /** 卡片内嵌表格配置 */
    innerTableConfig?: {
      /** 卡片起始后的表头偏移行数 */
      headerOffset?: number;
      /** 数据起始偏移 */
      dataStartOffset?: number;
      /** 内表字段映射 */
      fieldMapping?: Record<string, FieldExtractor>;
    };
  };

  // ---- 尾部/散落信息提取 ----
  metadataExtraction?: MetadataRegion[];

  // ---- 纯文本解析 ----
  textParsing?: {
    /** 记录分隔正则 */
    recordSeparator: string;
    /** 字段提取正则 { fieldName: regex } */
    fieldPatterns: Record<string, string>;
    /** 物品行正则(用于一条记录包含多个物品的场景) */
    itemPattern?: string;
    /** 物品行提取的字段名列表 */
    itemFields?: string[];
  };

  // ---- 复合单元格拆分 ----
  cellSplitting?: {
    /** 要拆分的源字段名 */
    targetField: string;
    /** 拆分正则(如 "\\n") */
    splitPattern: string;
    /** 每项提取正则(如 "(.+)[xX×](\\d+)") */
    extractPattern: string;
    /** 提取后映射到的字段(如 ["skuName","skuQuantity"]) */
    extractFields: string[];
  };

  // ---- 后处理 ----
  postProcessing?: {
    /** 去除所有字段值首尾空白 */
    trimWhitespace?: boolean;
    /** 移除所有必填字段都为空的行 */
    removeEmptyRows?: boolean;
    /** 字段为空时填充默认值 */
    defaultValues?: Record<string, string>;
    /** 无条件覆盖指定字段值 */
    staticValues?: Record<string, string>;
  };
}

/** 解析后的标准化记录 */
export interface ParsedRecord {
  externalCode?: string;
  storeName?: string;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  skuCode?: string;
  skuName?: string;
  skuQuantity?: number | string;
  skuSpec?: string;
  remark?: string;
  /** 字段级错误 */
  _errors?: Record<string, string>;
  /** 原始行号(1-based) */
  _rowIndex?: number;
}

/** 规则引擎解析结果 */
export interface ParseResult {
  success: boolean;
  data: ParsedRecord[];
  errors?: string[];
  totalRows?: number;
  parsedRows?: number;
}

/** 原始文件数据(由文件解析器提供) */
export interface RawFileData {
  type: 'excel' | 'word' | 'pdf';
  /** Excel多Sheet数据 */
  sheets?: RawSheet[];
  /** Word/PDF全文本 */
  text?: string;
  /** PDF按页文本 */
  pages?: string[];
}

/** 单个Sheet的原始数据 */
export interface RawSheet {
  name: string;
  /** 二维数组, data[row][col] */
  data: (string | number | null | undefined)[][];
}
