// ============================================================
// 规则引擎核心 - 通用导入系统
// 所有解析逻辑完全由规则JSON配置驱动，代码零硬编码
// ============================================================

import type {
  ParseRule,
  ParseResult,
  ParsedRecord,
  RawFileData,
  RawSheet,
  FieldExtractor,
  MetadataRegion,
} from './types';

/** dataRegion 的默认空对象类型 */
type DataRegionConfig = NonNullable<ParseRule['dataRegion']>;

// ==================== 正则缓存 ====================

/** 正则表达式缓存，避免循环中重复编译 */
const regexCache = new Map<string, RegExp>();

function getCachedRegex(pattern: string): RegExp | null {
  let re = regexCache.get(pattern);
  if (re) return re;
  try {
    re = new RegExp(pattern);
    regexCache.set(pattern, re);
    return re;
  } catch {
    return null;
  }
}

// ==================== 辅助函数 ====================

/**
 * 将单元格地址(如 "A1", "B9") 转为 0-based 行列索引
 * A=0, B=1, ..., Z=25, AA=26, ...
 */
export function cellToIndex(cell: string): { row: number; col: number } {
  const match = cell.match(/^([A-Z]+)(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid cell reference: ${cell}`);
  }
  const colStr = match[1].toUpperCase();
  const rowStr = match[2];

  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  col -= 1; // 转0-based

  const row = parseInt(rowStr, 10) - 1; // 转0-based
  return { row, col };
}

/**
 * 应用正则提取文本
 * @returns 匹配到的捕获组文本，未匹配返回 undefined
 */
export function applyRegex(
  text: string,
  regex: string,
  group?: number
): string | undefined {
  try {
    const re = getCachedRegex(regex);
    if (!re) return undefined;
    const match = re.exec(text);
    if (!match) return undefined;
    const targetGroup = group ?? 1;
    return match[targetGroup] !== undefined ? match[targetGroup] : match[0];
  } catch {
    return undefined;
  }
}

/**
 * 检查行数据是否匹配某个文本模式
 * 使用预编译正则（推荐传入compiled参数）
 */
export function matchesPattern(
  row: (string | number | null | undefined)[],
  pattern: string | RegExp
): boolean {
  const rowText = row.map((c) => String(c ?? '')).join(' ');
  try {
    if (pattern instanceof RegExp) {
      return pattern.test(rowText);
    }
    const re = getCachedRegex(pattern);
    return re ? re.test(rowText) : false;
  } catch {
    return false;
  }
}

/**
 * 安全获取单元格值，转为字符串
 */
function cellValue(
  sheet: (string | number | null | undefined)[][],
  row: number,
  col: number
): string {
  if (row < 0 || row >= sheet.length) return '';
  const r = sheet[row];
  if (!r || col < 0 || col >= r.length) return '';
  const v = r[col];
  return v === null || v === undefined ? '' : String(v);
}

/**
 * 根据列名在 header 行中查找列索引(0-based)
 */
function resolveColumnIndex(
  columnName: string,
  headers: string[]
): number {
  const lower = columnName.toLowerCase().trim();
  // 精确匹配(忽略大小写)
  let idx = headers.findIndex((h) => h.toLowerCase().trim() === lower);
  if (idx >= 0) return idx;
  // 包含匹配
  idx = headers.findIndex((h) => h.toLowerCase().includes(lower));
  return idx; // 可能返回 -1
}

/**
 * 根据 FieldExtractor 从数据行中提取值
 * @param row 行数据(一维数组)
 * @param extractor 字段提取器
 * @param headers 列头(可选，用于列名查找)
 * @param fullSheet 完整sheet数据(可选，用于cell类型定位)
 * @param rowIndex 当前行在sheet中的0-based行号(用于regex全行匹配)
 */
export function extractFieldValue(
  row: (string | number | null | undefined)[],
  extractor: FieldExtractor,
  headers?: string[],
  fullSheet?: (string | number | null | undefined)[][],
  rowIndex?: number
): string {
  switch (extractor.type) {
    case 'static':
      return extractor.staticValue ?? '';

    case 'column': {
      if (extractor.column === undefined) return '';
      if (typeof extractor.column === 'number') {
        // 直接列索引(0-based)
        const val = row[extractor.column];
        return val === null || val === undefined ? '' : String(val);
      }
      // 字符串列名 → 通过header查找索引
      if (headers) {
        const idx = resolveColumnIndex(extractor.column, headers);
        if (idx >= 0) {
          const val = row[idx];
          return val === null || val === undefined ? '' : String(val);
        }
      }
      return '';
    }

    case 'cell': {
      if (!extractor.cell) return '';
      try {
        const { row: r, col: c } = cellToIndex(extractor.cell);
        if (fullSheet) {
          return cellValue(fullSheet, r, c);
        }
        // 退化：如果只有行数据，尝试从当前行取
        const val = row[c];
        return val === null || val === undefined ? '' : String(val);
      } catch {
        return '';
      }
    }

    case 'regex': {
      if (!extractor.regex) return '';
      // 拼接整行为文本
      const rowText = row.map((c) => String(c ?? '')).join(' ');
      return applyRegex(rowText, extractor.regex, extractor.regexGroup) ?? '';
    }

    case 'formula': {
      // 预留：公式类型暂返回空
      return '';
    }

    default:
      return '';
  }
}

// ==================== 规则引擎类 ====================

export class RuleEngine {
  /**
   * 核心入口：解析原始文件数据
   */
  parse(rawData: RawFileData, rule: ParseRule): ParseResult {
    const errors: string[] = [];

    // 防御性校验: 确保 rule.source 存在
    if (!rule || !rule.source || !rule.source.type) {
      // 尝试从规则配置推断 source type
      if (rule && !rule.source) {
        if (rule.matrixTranspose) {
          rule = { ...rule, source: { type: 'matrix' } };
        } else if (rule.cardParsing) {
          rule = { ...rule, source: { type: 'card' } };
        } else if (rule.textParsing) {
          rule = { ...rule, source: { type: 'text' } };
        } else if (rule.fieldMapping || rule.dataRegion) {
          rule = { ...rule, source: { type: 'table' } };
        } else {
          return {
            success: false,
            data: [],
            errors: ['规则配置缺少 source 字段，无法确定解析模式。请重新生成或编辑规则。'],
            totalRows: 0,
            parsedRows: 0,
          };
        }
      } else if (!rule) {
        return {
          success: false,
          data: [],
          errors: ['规则配置为空，请检查规则是否正确保存。'],
          totalRows: 0,
          parsedRows: 0,
        };
      }
    }

    try {
      let records: ParsedRecord[] = [];

      switch (rule.source.type) {
        case 'table':
          records = this.parseTableMode(rawData, rule, errors);
          break;
        case 'matrix':
          records = this.parseMatrixMode(rawData, rule, errors);
          break;
        case 'card':
          records = this.parseCardMode(rawData, rule, errors);
          break;
        case 'text':
          records = this.parseTextMode(rawData, rule, errors);
          break;
        case 'multi-sheet':
          records = this.parseMultiSheetMode(rawData, rule, errors);
          break;
        default:
          errors.push(`Unknown source type: ${rule.source.type}`);
      }

      // 复合单元格拆分
      if (rule.cellSplitting) {
        records = this.applyCellSplitting(records, rule.cellSplitting);
      }

      // 聚合
      if (rule.aggregation) {
        records = this.applyAggregation(records, rule.aggregation);
      }

      // 后处理
      if (rule.postProcessing) {
        records = this.applyPostProcessing(records, rule.postProcessing);
      }

      return {
        success: errors.length === 0,
        data: records,
        errors: errors.length > 0 ? errors : undefined,
        totalRows: records.length,
        parsedRows: records.filter((r) => !r._errors || Object.keys(r._errors).length === 0).length,
      };
    } catch (err) {
      return {
        success: false,
        data: [],
        errors: [`Engine error: ${err instanceof Error ? err.message : String(err)}`],
        totalRows: 0,
        parsedRows: 0,
      };
    }
  }

  // ==================== A) TABLE 模式 ====================

  private parseTableMode(
    rawData: RawFileData,
    rule: ParseRule,
    errors: string[]
  ): ParsedRecord[] {
    const sheet = this.selectSheet(rawData, rule, errors);
    if (!sheet) return [];

    const sheetData = sheet.data;
    const region: DataRegionConfig = rule.dataRegion ?? {} as DataRegionConfig;
    const mapping = rule.fieldMapping ?? {};

    // 确定表头行(1-based → 0-based)
    const headerRowIndex = region.headerRow != null ? region.headerRow - 1 : 0;
    const headers = this.buildHeaders(sheetData, headerRowIndex);

    // 确定数据范围
    const dataStart = region.dataStartRow != null ? region.dataStartRow - 1 : headerRowIndex + 1;
    const dataEnd = this.resolveDataEndRow(sheetData, region.dataEndRow);

    // 收集行(含过滤)
    const dataRows = this.collectDataRows(
      sheetData,
      dataStart,
      dataEnd,
      region.skipRows ?? [],
      region.skipPatterns ?? []
    );

    // 逐行提取字段
    const records: ParsedRecord[] = dataRows.map(({ row, originalRowIndex }) => {
      const record = this.extractRecordFromRow(row, mapping, headers, sheetData, originalRowIndex);
      record._rowIndex = originalRowIndex + 1; // 1-based
      return record;
    });

    // 应用 metadataExtraction（非数据区散落字段）
    if (rule.metadataExtraction && rule.metadataExtraction.length > 0) {
      const metaFields = this.extractMetadata(sheetData, rule.metadataExtraction, headerRowIndex, dataStart);
      // 将散落字段填入每条记录
      for (const record of records) {
        for (const [field, value] of Object.entries(metaFields)) {
          if (value && (!record[field as keyof ParsedRecord] || record[field as keyof ParsedRecord] === '')) {
            (record as Record<string, unknown>)[field] = value;
          }
        }
      }
    }

    return records;
  }

  // ==================== B) MATRIX 模式 ====================

  private parseMatrixMode(
    rawData: RawFileData,
    rule: ParseRule,
    errors: string[]
  ): ParsedRecord[] {
    const sheet = this.selectSheet(rawData, rule, errors);
    if (!sheet) return [];

    const sheetData = sheet.data;
    const mt = rule.matrixTranspose;
    if (!mt) {
      errors.push('matrixTranspose config is required for matrix mode');
      return [];
    }

    const region: DataRegionConfig = rule.dataRegion ?? {} as DataRegionConfig;
    const headerRowIndex = region.headerRow != null ? region.headerRow - 1 : 0;
    const dataStart = region.dataStartRow != null ? region.dataStartRow - 1 : headerRowIndex + 1;
    const dataEnd = this.resolveDataEndRow(sheetData, region.dataEndRow);

    // 从 transposeHeaderRow 获取动态列头名称
    const transHeaderRowIndex = mt.transposeHeaderRow - 1; // 1-based → 0-based
    const transHeaders: string[] = [];
    if (transHeaderRowIndex >= 0 && transHeaderRowIndex < sheetData.length) {
      const headerRow = sheetData[transHeaderRowIndex];
      for (let c = mt.transposeStartCol; c < headerRow.length; c++) {
        transHeaders.push(String(headerRow[c] ?? '').trim());
      }
    }

    const mapping = rule.fieldMapping ?? {};
    const records: ParsedRecord[] = [];

    // 遍历数据行
    for (let r = dataStart; r < dataEnd; r++) {
      const row = sheetData[r];
      if (!row) continue;

      // 跳过指定行 (使用预编译正则)
      if (region.skipRows?.includes(r + 1)) continue;
      if (region.skipPatterns?.some((p) => matchesPattern(row, p))) continue;

      // 提取固定列数据(构建基础记录)
      const baseRecord: ParsedRecord = {};
      for (const [fieldKey, extractor] of Object.entries(mapping)) {
        if (!extractor) continue;
        // 对于matrix模式，column类型的extractor只提取fixedColumns相关
        const val = extractFieldValue(row, extractor, undefined, sheetData, r);
        (baseRecord as Record<string, unknown>)[fieldKey] = val;
      }
      baseRecord._rowIndex = r + 1;

      // 对每个动态列(转置列)生成一条记录
      for (let ci = 0; ci < transHeaders.length; ci++) {
        const colIdx = mt.transposeStartCol + ci;
        const cellVal = cellValue(sheetData, r, colIdx);

        if (mt.skipEmptyValues && (!cellVal || cellVal.trim() === '')) {
          continue;
        }

        const record: ParsedRecord = { ...baseRecord };
        // 动态列头 → headerField
        (record as Record<string, unknown>)[mt.headerField] = transHeaders[ci];
        // 单元格值 → valueField
        (record as Record<string, unknown>)[mt.valueField] = cellVal;

        records.push(record);
      }
    }

    // 如果配置了 cellSplitting，先拆分再转置的逻辑已在后处理统一处理
    return records;
  }

  // ==================== C) CARD 模式 ====================

  private parseCardMode(
    rawData: RawFileData,
    rule: ParseRule,
    errors: string[]
  ): ParsedRecord[] {
    const sheet = this.selectSheet(rawData, rule, errors);
    if (!sheet) return [];

    const sheetData = sheet.data;
    const cp = rule.cardParsing;
    if (!cp) {
      errors.push('cardParsing config is required for card mode');
      return [];
    }

    // 1. 按 cardStartPattern 分割为多个卡片
    const cards: { startRow: number; rows: (string | number | null | undefined)[][] }[] = [];
    let currentCard: { startRow: number; rows: (string | number | null | undefined)[][] } | null = null;

    // 预编译正则，避免循环内重复编译
    const startRegex = getCachedRegex(cp.cardStartPattern)!;
    const endRegex = cp.cardEndPattern ? getCachedRegex(cp.cardEndPattern) : null;
    // 预编译metadata正则
    const compiledMetaPatterns: Array<[string, RegExp]> = cp.metadataPatterns
      ? Object.entries(cp.metadataPatterns).map(([k, v]): [string, RegExp] => [k, getCachedRegex(v)!]).filter(([, re]) => re)
      : [];

    for (let r = 0; r < sheetData.length; r++) {
      const row = sheetData[r];
      const rowText = row.map((c) => String(c ?? '')).join(' ');

      if (startRegex.test(rowText)) {
        // 新卡片开始
        if (currentCard) {
          cards.push(currentCard);
        }
        currentCard = { startRow: r, rows: [row] };
        continue;
      }

      if (currentCard) {
        // 检查是否卡片结束
        if (endRegex && endRegex.test(rowText)) {
          currentCard.rows.push(row);
          cards.push(currentCard);
          currentCard = null;
          continue;
        }
        currentCard.rows.push(row);
      }
    }
    // 最后一个卡片
    if (currentCard) {
      cards.push(currentCard);
    }

    // 2. 对每个卡片解析
    const records: ParsedRecord[] = [];

    for (const card of cards) {
      // 提取卡片级元信息
      const cardMeta: Record<string, string> = {};
      if (cp.metadataPatterns) {
        for (const [fieldName, regex] of compiledMetaPatterns) {
          for (const row of card.rows) {
            const rowText = row.map((c) => String(c ?? '')).join(' ');
            const val = applyRegex(rowText, regex.source);
            if (val) {
              cardMeta[fieldName] = val;
              break; // 找到即停止
            }
          }
        }
      }

      // 解析内嵌表格
      const innerConfig = cp.innerTableConfig;
      if (innerConfig) {
        const headerOffset = innerConfig.headerOffset ?? 0;
        const dataStartOffset = innerConfig.dataStartOffset ?? (headerOffset + 1);

        // 内表表头
        const innerHeaderRow = card.rows[headerOffset];
        const innerHeaders = innerHeaderRow
          ? innerHeaderRow.map((c) => String(c ?? '').trim())
          : [];

        // 内表数据行
        for (let i = dataStartOffset; i < card.rows.length; i++) {
          const row = card.rows[i];
          if (!row) continue;

          // 如果遇到空行或下一个卡片标志则停止
          const rowText = row.map((c) => String(c ?? '')).join('').trim();
          if (rowText === '') continue;
          if (startRegex.test(row.map((c) => String(c ?? '')).join(' '))) break;

          const record: ParsedRecord = {};

          // 填入卡片级字段
          for (const [field, value] of Object.entries(cardMeta)) {
            (record as Record<string, unknown>)[field] = value;
          }

          // 填入内表字段
          if (innerConfig.fieldMapping) {
            for (const [fieldKey, extractor] of Object.entries(innerConfig.fieldMapping)) {
              const val = extractFieldValue(row, extractor, innerHeaders, card.rows, i);
              (record as Record<string, unknown>)[fieldKey] = val;
            }
          }

          record._rowIndex = card.startRow + i + 1; // 1-based
          records.push(record);
        }
      } else {
        // 没有内嵌表格，每张卡片生成一条记录
        const record: ParsedRecord = {};
        for (const [field, value] of Object.entries(cardMeta)) {
          (record as Record<string, unknown>)[field] = value;
        }
        record._rowIndex = card.startRow + 1;
        records.push(record);
      }
    }

    return records;
  }

  // ==================== D) TEXT 模式 ====================

  private parseTextMode(
    rawData: RawFileData,
    rule: ParseRule,
    errors: string[]
  ): ParsedRecord[] {
    const tp = rule.textParsing;
    if (!tp) {
      errors.push('textParsing config is required for text mode');
      return [];
    }

    const text = rawData.text ?? rawData.pages?.join('\n') ?? '';
    if (!text.trim()) {
      errors.push('No text content available for text mode parsing');
      return [];
    }

    // 按记录分隔符分割
    let recordTexts: string[];
    try {
      const sepRegex = getCachedRegex(tp.recordSeparator);
      if (!sepRegex) {
        errors.push(`Invalid recordSeparator regex: ${tp.recordSeparator}`);
        return [];
      }
      recordTexts = text.split(new RegExp(tp.recordSeparator, 'g')).filter((t) => t.trim());
    } catch (e) {
      errors.push(`Invalid recordSeparator regex: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }

    const records: ParsedRecord[] = [];

    for (const recordText of recordTexts) {
      // 提取字段
      const record: ParsedRecord = {};
      let hasError = false;

      for (const [fieldName, regex] of Object.entries(tp.fieldPatterns)) {
        try {
          const val = applyRegex(recordText, regex);
          if (val) {
            (record as Record<string, unknown>)[fieldName] = val;
          }
        } catch {
          if (!record._errors) record._errors = {};
          record._errors[fieldName] = `Regex error for field ${fieldName}`;
          hasError = true;
        }
      }

      // 如果有物品行模式 (预编译正则)
      if (tp.itemPattern && tp.itemFields && tp.itemFields.length > 0) {
        try {
          const itemRegex = new RegExp(tp.itemPattern, 'g');
          const items: string[][] = [];
          let m;

          while ((m = itemRegex.exec(recordText)) !== null) {
            const itemValues: string[] = [];
            for (let g = 1; g <= tp.itemFields.length; g++) {
              itemValues.push(m[g] ?? '');
            }
            items.push(itemValues);
          }

          if (items.length > 0) {
            // 每个物品行生成一条记录，共享外层字段
            for (const itemValues of items) {
              const itemRecord: ParsedRecord = { ...record };
              for (let i = 0; i < tp.itemFields.length; i++) {
                (itemRecord as Record<string, unknown>)[tp.itemFields[i]] = itemValues[i] ?? '';
              }
              records.push(itemRecord);
            }
            continue; // 跳过下方单条记录添加
          }
        } catch {
          // 物品行正则失败，退化到单条记录
        }
      }

      records.push(record);
    }

    return records;
  }

  // ==================== E) MULTI-SHEET 模式 ====================

  private parseMultiSheetMode(
    rawData: RawFileData,
    rule: ParseRule,
    errors: string[]
  ): ParsedRecord[] {
    if (!rawData.sheets || rawData.sheets.length === 0) {
      errors.push('No sheet data available for multi-sheet mode');
      return [];
    }

    const sc = rule.source.sheetConfig;
    let targetSheets: RawSheet[];

    // 预编译表名匹配正则
    let nameRegex: RegExp | null = null;
    if (sc?.sheetNamePattern) {
      nameRegex = getCachedRegex(sc.sheetNamePattern);
    }

    if (sc?.allSheets) {
      targetSheets = rawData.sheets;
    } else if (nameRegex) {
      targetSheets = rawData.sheets.filter((s) => nameRegex!.test(s.name));
    } else if (sc?.sheetIndex != null) {
      targetSheets = [rawData.sheets[sc.sheetIndex]].filter(Boolean);
    } else {
      targetSheets = rawData.sheets;
    }

    const allRecords: ParsedRecord[] = [];

    // 对每个sheet按 table 模式解析
    for (const sheet of targetSheets) {
      const singleRawData: RawFileData = {
        type: rawData.type,
        sheets: [sheet],
      };

      const sheetRecords = this.parseTableMode(singleRawData, rule, errors);

      // 如果配置了 matrixTranspose，也尝试 matrix 解析
      // (multi-sheet 默认走 table，如需 matrix 则 source.type 应为 matrix)

      allRecords.push(...sheetRecords);
    }

    return allRecords;
  }

  // ==================== 辅助方法 ====================

  /**
   * 根据 sheetConfig 选择目标 sheet
   */
  private selectSheet(
    rawData: RawFileData,
    rule: ParseRule,
    errors: string[]
  ): RawSheet | null {
    if (!rawData.sheets || rawData.sheets.length === 0) {
      errors.push('No sheet data available');
      return null;
    }

    const sc = rule.source.sheetConfig;
    if (!sc) {
      return rawData.sheets[0] ?? null;
    }

    // 预编译表名匹配正则
    let nameRegex: RegExp | null = null;
    if (sc.sheetNamePattern) {
      nameRegex = getCachedRegex(sc.sheetNamePattern);
      if (!nameRegex) {
        errors.push(`Invalid sheetNamePattern: ${sc.sheetNamePattern}`);
        return null;
      }
    }

    if (sc.sheetIndex != null) {
      const sheet = rawData.sheets[sc.sheetIndex];
      if (!sheet) {
        errors.push(`Sheet index ${sc.sheetIndex} out of range`);
        return null;
      }
      return sheet;
    }

    if (nameRegex) {
      const sheet = rawData.sheets.find((s) => nameRegex!.test(s.name));
      if (!sheet) {
        errors.push(`No sheet matches pattern: ${sc.sheetNamePattern}`);
        return null;
      }
      return sheet;
    }

    return rawData.sheets[0] ?? null;
  }

  /**
   * 构建列头数组(0-based索引对应列名)
   */
  private buildHeaders(
    sheetData: (string | number | null | undefined)[][],
    headerRowIndex: number
  ): string[] {
    if (headerRowIndex < 0 || headerRowIndex >= sheetData.length) return [];
    const headerRow = sheetData[headerRowIndex];
    if (!headerRow) return [];
    return headerRow.map((c) => String(c ?? '').trim());
  }

  /**
   * 解析数据结束行
   */
  private resolveDataEndRow(
    sheetData: (string | number | null | undefined)[][],
    dataEndRow?: number | 'auto'
  ): number {
    if (dataEndRow === undefined || dataEndRow === 'auto') {
      // 自动检测：从底部向上找到第一个非空行
      for (let r = sheetData.length - 1; r >= 0; r--) {
        const row = sheetData[r];
        if (row && row.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) {
          return r + 1; // exclusive end
        }
      }
      return 0;
    }
    return dataEndRow; // 1-based end → 作为 exclusive 上界即可
  }

  /**
   * 收集数据行(含 skipRows 和 skipPatterns 过滤)
   * @returns 行数据数组，每项含 row 和 originalRowIndex(0-based)
   */
  private collectDataRows(
    sheetData: (string | number | null | undefined)[][],
    dataStart: number,
    dataEnd: number,
    skipRows: number[],
    skipPatterns: string[]
  ): { row: (string | number | null | undefined)[]; originalRowIndex: number }[] {
    // 预编译skipPatterns正则，避免循环中重复编译
    const compiledSkipPatterns = (skipPatterns ?? []).map((p) => getCachedRegex(p)).filter(Boolean) as RegExp[];

    const result: { row: (string | number | null | undefined)[]; originalRowIndex: number }[] = [];

    for (let r = dataStart; r < dataEnd && r < sheetData.length; r++) {
      const row = sheetData[r];
      if (!row) continue;

      // skipRows: 1-based行号
      if (skipRows.includes(r + 1)) continue;

      // skipPatterns (使用预编译正则)
      if (compiledSkipPatterns.some((re) => matchesPattern(row, re))) continue;

      result.push({ row, originalRowIndex: r });
    }

    return result;
  }

  /**
   * 从单行数据提取一条记录
   */
  private extractRecordFromRow(
    row: (string | number | null | undefined)[],
    mapping: Record<string, FieldExtractor | undefined>,
    headers: string[],
    fullSheet: (string | number | null | undefined)[][],
    rowIndex: number
  ): ParsedRecord {
    const record: ParsedRecord = {};

    for (const [fieldKey, extractor] of Object.entries(mapping)) {
      if (!extractor) continue;
      const val = extractFieldValue(row, extractor, headers, fullSheet, rowIndex);
      (record as Record<string, unknown>)[fieldKey] = val;
    }

    return record;
  }

  /**
   * 从非数据区提取散落字段(metadataExtraction)
   */
  private extractMetadata(
    sheetData: (string | number | null | undefined)[][],
    regions: MetadataRegion[],
    headerRowIndex: number,
    dataStartRow: number
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const region of regions) {
      const value = this.extractMetadataRegion(sheetData, region, headerRowIndex, dataStartRow);
      if (value) {
        result[region.targetField] = value;
      }
    }

    return result;
  }

  private extractMetadataRegion(
    sheetData: (string | number | null | undefined)[][],
    region: MetadataRegion,
    headerRowIndex: number,
    dataStartRow: number
  ): string | undefined {
    const { searchArea, row, column, regex, searchPattern, targetField: _targetField } = region;

    let searchRows: (string | number | null | undefined)[][] = [];

    switch (searchArea) {
      case 'header':
        // 只搜索表头区域(第0行到headerRow之前)
        for (let r = 0; r <= headerRowIndex && r < sheetData.length; r++) {
          searchRows.push(sheetData[r]);
        }
        break;

      case 'footer':
        // 搜索数据区之后的所有行
        for (let r = dataStartRow; r < sheetData.length; r++) {
          searchRows.push(sheetData[r]);
        }
        break;

      case 'specific-row':
        if (row != null && row - 1 < sheetData.length) {
          searchRows.push(sheetData[row - 1]); // 1-based → 0-based
        }
        break;

      case 'all':
      default:
        searchRows = sheetData;
        break;
    }

    // 如果指定了 searchPattern，先过滤匹配的行
    if (searchPattern) {
      searchRows = searchRows.filter((r) =>
        matchesPattern(r, searchPattern)
      );
    }

    // 从匹配行中提取值
    for (const r of searchRows) {
      let text: string;

      if (column != null) {
        // 指定了列号
        text = r[column] != null ? String(r[column]) : '';
      } else {
        // 整行拼接
        text = r.map((c) => String(c ?? '')).join(' ');
      }

      if (regex) {
        const val = applyRegex(text, regex);
        if (val) return val;
      } else if (text.trim()) {
        return text.trim();
      }
    }

    return undefined;
  }

  // ==================== 复合单元格拆分 ====================

  private applyCellSplitting(
    records: ParsedRecord[],
    config: NonNullable<ParseRule['cellSplitting']>
  ): ParsedRecord[] {
    // 预编译拆分正则和提取正则
    const splitRegex = getCachedRegex(config.splitPattern);
    const extractRegex = config.extractPattern ? getCachedRegex(config.extractPattern) : null;
    
    const result: ParsedRecord[] = [];
    
    for (const record of records) {
      const sourceValue = String(
        (record as Record<string, unknown>)[config.targetField] ?? ''
      );
    
      if (!sourceValue) {
        result.push(record);
        continue;
      }
    
      // 按拆分正则分割
      let parts: string[];
      try {
        parts = splitRegex ? sourceValue.split(splitRegex) : [sourceValue];
      } catch {
        result.push(record);
        continue;
      }

      if (parts.length <= 1) {
        result.push(record);
        continue;
      }

      // 对每个部分应用提取正则
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const newRecord: ParsedRecord = { ...record };

        if (extractRegex) {
          try {
            const match = extractRegex.exec(trimmed);
            if (match) {
              for (let i = 0; i < config.extractFields.length; i++) {
                (newRecord as Record<string, unknown>)[config.extractFields[i]] =
                  match[i + 1] ?? '';
              }
            } else {
              // 正则不匹配，保留原始文本到第一个提取字段
              if (config.extractFields.length > 0) {
                (newRecord as Record<string, unknown>)[config.extractFields[0]] = trimmed;
              }
            }
          } catch {
            if (config.extractFields.length > 0) {
              (newRecord as Record<string, unknown>)[config.extractFields[0]] = trimmed;
            }
          }
        } else {
          // 无提取正则，整段文本放到第一个字段
          if (config.extractFields.length > 0) {
            (newRecord as Record<string, unknown>)[config.extractFields[0]] = trimmed;
          }
        }

        result.push(newRecord);
      }
    }

    return result;
  }

  // ==================== 聚合 ====================

  private applyAggregation(
    records: ParsedRecord[],
    config: NonNullable<ParseRule['aggregation']>
  ): ParsedRecord[] {
    const { groupBy, sharedFields } = config;

    const groups = new Map<string, ParsedRecord[]>();

    for (const record of records) {
      const key = String((record as Record<string, unknown>)[groupBy] ?? '');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }

    const result: ParsedRecord[] = [];

    for (const [key, groupRecords] of groups) {
      // 取第一条记录作为基础
      const base = { ...groupRecords[0] };

      // 合并：sharedFields 取第一条的值
      // 非 sharedFields 且非 groupBy 的字段则收集所有值(用逗号拼接)
      for (const record of groupRecords.slice(1)) {
        for (const fieldKey of Object.keys(record) as (keyof ParsedRecord)[]) {
          if (fieldKey === '_rowIndex' || fieldKey === '_errors') continue;
          if (fieldKey === groupBy) continue;
          if (sharedFields.includes(fieldKey as string)) continue;

          const existingVal = String((base as Record<string, unknown>)[fieldKey] ?? '');
          const newVal = String((record as Record<string, unknown>)[fieldKey] ?? '');

          if (newVal && newVal !== existingVal) {
            if (existingVal) {
              (base as Record<string, unknown>)[fieldKey] = `${existingVal},${newVal}`;
            } else {
              (base as Record<string, unknown>)[fieldKey] = newVal;
            }
          }
        }
      }

      result.push(base);
    }

    return result;
  }

  // ==================== 后处理 ====================

  private applyPostProcessing(
    records: ParsedRecord[],
    config: NonNullable<ParseRule['postProcessing']>
  ): ParsedRecord[] {
    let result = records;

    // 1. trimWhitespace (原地修改，避免创建新对象)
    if (config.trimWhitespace) {
      for (let i = 0; i < result.length; i++) {
        const record = result[i];
        let needUpdate = false;
        for (const [key, value] of Object.entries(record)) {
          if (typeof value === 'string' && value !== value.trim()) {
            needUpdate = true;
            break;
          }
        }
        if (needUpdate) {
          const trimmed: ParsedRecord = {};
          for (const [key, value] of Object.entries(record)) {
            (trimmed as Record<string, unknown>)[key] = typeof value === 'string' ? value.trim() : value;
          }
          result[i] = trimmed;
        }
      }
    }

    // 2. defaultValues (原地修改)
    if (config.defaultValues) {
      for (let i = 0; i < result.length; i++) {
        const record = result[i];
        let needUpdate = false;
        for (const [field, defaultValue] of Object.entries(config.defaultValues!)) {
          const currentVal = (record as Record<string, unknown>)[field];
          if (currentVal === undefined || currentVal === null || currentVal === '') {
            if (!needUpdate) {
              result[i] = { ...record };
              needUpdate = true;
            }
            (result[i] as Record<string, unknown>)[field] = defaultValue;
          }
        }
      }
    }

    // 3. staticValues (原地修改)
    if (config.staticValues) {
      for (let i = 0; i < result.length; i++) {
        result[i] = { ...result[i] };
        for (const [field, value] of Object.entries(config.staticValues!)) {
          (result[i] as Record<string, unknown>)[field] = value;
        }
      }
    }

    // 4. removeEmptyRows - 移除所有关键字段都为空的行
    if (config.removeEmptyRows) {
      const essentialFields: (keyof ParsedRecord)[] = [
        'externalCode', 'storeName', 'receiverName', 'receiverPhone',
        'receiverAddress', 'skuCode', 'skuName', 'skuQuantity', 'skuSpec', 'remark',
      ];
      result = result.filter((record) => {
        return essentialFields.some((field) => {
          const val = record[field];
          return val !== undefined && val !== null && val !== '';
        });
      });
    }

    return result;
  }
}

// 导出单例方便使用
export const ruleEngine = new RuleEngine();
