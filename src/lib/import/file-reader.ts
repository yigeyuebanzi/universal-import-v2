import type { ParseRule, RawFileData, RawSheet } from '@/lib/rules/types';
import { matchesPattern } from '@/lib/rules/engine';
import { parseExcel } from '@/lib/parsers/excel';
import { parseWord } from '@/lib/parsers/word';
import { parsePdf } from '@/lib/parsers/pdf';
import { readUpload } from '@/lib/storage';
import { getXlsxSheets, loadSharedStrings, streamSheetRows } from '@/lib/import/xlsx-stream';

export type FileKind = 'excel' | 'word' | 'pdf';

export function detectFileKind(fileName: string): FileKind | 'unsupported' {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (['xlsx', 'xls'].includes(ext)) return 'excel';
  if (['docx', 'doc'].includes(ext)) return 'word';
  if (ext === 'pdf') return 'pdf';
  return 'unsupported';
}

function selectTargetSheet(
  rule: ParseRule,
  sheetName: string,
  sheetIndex: number
): boolean {
  const sc = rule.source.sheetConfig;
  if (!sc) return sheetIndex === 0;
  if (sc.sheetIndex != null) return sheetIndex === sc.sheetIndex;
  if (sc.sheetNamePattern) {
    try {
      return new RegExp(sc.sheetNamePattern).test(sheetName);
    } catch {
      return false;
    }
  }
  if (sc.allSheets) return true;
  return sheetIndex === 0;
}

function isNonEmptyRow(row: (string | number | null)[]): boolean {
  return row.some((v) => v !== null && String(v).trim() !== '');
}

async function countExcelRows(ref: string, rule: ParseRule): Promise<number> {
  const region = rule.dataRegion ?? {};
  const headerRow = region.headerRow ?? 1;
  const dataStart = region.dataStartRow ?? headerRow + 1;
  const sheets = await getXlsxSheets(ref);
  const target = sheets.find((s) => selectTargetSheet(rule, s.name, s.index));
  if (!target) return 0;
  const sharedStrings = await loadSharedStrings(ref);
  let total = 0;

  await streamSheetRows(
    ref,
    target.path,
    (row, rowNumber) => {
      if (rowNumber < dataStart) return false;
      if (typeof region.dataEndRow === 'number' && rowNumber > region.dataEndRow) return true;
      if (region.skipRows?.includes(rowNumber)) return false;
      if (region.skipPatterns?.some((p) => matchesPattern(row, p))) return false;
      if (isNonEmptyRow(row)) total++;
      return false;
    },
    sharedStrings
  );

  return total;
}

async function isXlsx(ref: string): Promise<boolean> {
  const sheets = await getXlsxSheets(ref);
  return sheets.length > 0;
}

async function readXlsxBatch(
  ref: string,
  rule: ParseRule,
  startRow: number,
  endRow: number
): Promise<RawFileData> {
  const sheets = await getXlsxSheets(ref);
  const target = sheets.find((s) => selectTargetSheet(rule, s.name, s.index));
  if (!target) {
    return { type: 'excel', sheets: [{ name: 'Sheet1', data: [] }] };
  }

  const sharedStrings = await loadSharedStrings(ref);
  const dataStartRow = rule.dataRegion?.dataStartRow ?? (rule.dataRegion?.headerRow ?? 1) + 1;
  // startRow/endRow are data-row numbers; the file prefix must include the
  // header plus all data rows up to endRow.
  const fileEndRow = dataStartRow + endRow - 1;
  const rows: (string | number | null)[][] = [];
  await streamSheetRows(
    ref,
    target.path,
    (row) => {
      rows.push(row);
      return rows.length >= fileEndRow;
    },
    sharedStrings
  );

  return {
    type: 'excel',
    sheets: [{ name: target.name, data: rows }],
  };
}

async function readExcelBatch(
  ref: string,
  rule: ParseRule,
  startRow: number,
  endRow: number
): Promise<RawFileData> {
  // multi-sheet with allSheets needs the whole workbook; fall back to the V2
  // parser. Legacy .xls files cannot be streamed through the zip reader.
  if (
    (rule.source.type === 'multi-sheet' && rule.source.sheetConfig?.allSheets) ||
    !(await isXlsx(ref))
  ) {
    const buffer = await readUpload({ ref });
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    return parseExcel(arrayBuffer, { allSheets: rule.source.sheetConfig?.allSheets });
  }

  return readXlsxBatch(ref, rule, startRow, endRow);
}

async function readTextFile(ref: string, fileType: 'word' | 'pdf'): Promise<RawFileData> {
  const buffer = await readUpload({ ref });
  if (fileType === 'word') {
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    return parseWord(arrayBuffer);
  }
  return parsePdf(buffer);
}

export interface BatchSource {
  kind: FileKind;
  rawData: RawFileData;
}

export async function readBatchSource(
  ref: string,
  fileType: FileKind,
  rule: ParseRule,
  startRow: number,
  endRow: number
): Promise<BatchSource> {
  if (fileType === 'excel') {
    return { kind: 'excel', rawData: await readExcelBatch(ref, rule, startRow, endRow) };
  }
  return { kind: fileType, rawData: await readTextFile(ref, fileType) };
}

export async function countFileRows(
  ref: string,
  fileType: FileKind,
  rule: ParseRule
): Promise<number> {
  if (fileType === 'excel') {
    return countExcelRows(ref, rule);
  }

  const raw = await readTextFile(ref, fileType);
  const text = raw.text ?? raw.pages?.join('\n') ?? '';
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}
