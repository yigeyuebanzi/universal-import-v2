/**
 * Excel解析器
 * 将 .xlsx/.xls 文件解析为二维数组格式
 * 支持多Sheet读取
 */
import * as XLSX from 'xlsx';
import type { RawFileData, RawSheet } from './types';

export interface ExcelParseOptions {
  /** 指定读取的Sheet索引，默认0 */
  sheetIndex?: number;
  /** 读取所有Sheet */
  allSheets?: boolean;
}

/**
 * 从ArrayBuffer解析Excel文件
 * @param buffer - 文件的ArrayBuffer
 * @param options - 解析选项
 * @returns RawFileData
 */
export function parseExcel(buffer: ArrayBuffer, options?: ExcelParseOptions): RawFileData {
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetNames = options?.allSheets
    ? workbook.SheetNames
    : [workbook.SheetNames[options?.sheetIndex ?? 0]];

  const sheets: RawSheet[] = [];

  for (const name of sheetNames) {
    if (!name) continue;
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;

    const data = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    sheets.push({ name, data });
  }

  return { type: 'excel', sheets };
}
