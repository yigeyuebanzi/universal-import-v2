import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTasks, skuMaster, waybills } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { ERROR_CODES, maskSensitiveValue, shouldMask, suggestionFor, type RowError } from '@/lib/errors';
import type { ParsedRecord } from '@/lib/rules/types';

export interface NormalizedRow {
  externalOrderNo: string;
  storeName: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  remark: string;
  skuCode: string;
  skuName: string;
  skuQuantity: string;
  skuSpec: string;
  lineNo: number;
  rowNumber: number;
}

export interface ValidationOutcome {
  rows: NormalizedRow[];
  errors: RowError[];
  skuValidationSkipped: boolean;
}

type TaskRow = { id: string; degraded: boolean; traceId: string };

export type SkuLoader = (codes: string[]) => Promise<Set<string>>;

export async function defaultSkuLoader(codes: string[]): Promise<Set<string>> {
  const uniq = [...new Set(codes)];
  if (uniq.length === 0) return new Set();
  const result = await db
    .select({ skuCode: skuMaster.skuCode })
    .from(skuMaster)
    .where(inArray(skuMaster.skuCode, uniq));
  return new Set(result.map((r) => r.skuCode));
}

export async function loadSkuSet(
  codes: string[],
  task: TaskRow,
  loader: SkuLoader = defaultSkuLoader
): Promise<Set<string> | 'degraded'> {
  if (task.degraded) return 'degraded';

  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      loader(codes),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('SKU_CHECK_TIMEOUT')),
          config.skuCheckTimeoutMs
        );
      }),
    ]);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const degradable = message === 'SKU_CHECK_TIMEOUT' || /connection|connect|ECONN|timeout/i.test(message);
    if (!degradable) throw err;

    await db
      .update(importTasks)
      .set({ degraded: true, degradedAt: new Date() })
      .where(and(eq(importTasks.id, task.id), eq(importTasks.degraded, false)));
    return 'degraded';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function clean(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function validateRecord(
  record: ParsedRecord,
  ruleName: string,
  existingKeys: Set<string>,
  validSkus: Set<string> | 'degraded',
  seenKeys: Map<string, number>,
  errorsOut: RowError[],
  errorStart: number
): NormalizedRow | null {
  const rowNumber = record._rowIndex ?? 0;
  const pushError = (
    fieldName: string,
    rawValue: unknown,
    errorCode: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
    reason: string
  ) => {
    errorsOut.push({
      rowNumber,
      fieldName,
      rawValue: shouldMask(fieldName) ? maskSensitiveValue(fieldName, rawValue) : clean(rawValue),
      errorCode,
      errorReason: reason,
      suggestion: suggestionFor(errorCode),
    });
  };

  if (record._errors && Object.keys(record._errors).length > 0) {
    for (const [field, reason] of Object.entries(record._errors)) {
      pushError(field, record[field as keyof ParsedRecord], ERROR_CODES.RULE_MAPPING, reason);
    }
    return null;
  }

  const externalOrderNo = clean(record.externalCode);
  const skuCode = clean(record.skuCode);
  const receiverName = clean(record.receiverName);
  const receiverPhone = clean(record.receiverPhone);
  const skuQuantity = clean(record.skuQuantity);

  for (const field of config.requiredFields) {
    const value = clean(record[field as keyof ParsedRecord]);
    if (!value) {
      pushError(field, record[field as keyof ParsedRecord], ERROR_CODES.REQUIRED_FIELD, `必填字段 ${field} 缺失`);
    }
  }

  if (receiverPhone && !/^1[3-9]\d{9}$/.test(receiverPhone)) {
    pushError('receiverPhone', receiverPhone, ERROR_CODES.PHONE_FORMAT, '手机号格式不正确，需为 11 位大陆手机号');
  }

  let quantityNumber = Number.NaN;
  if (skuQuantity) {
    quantityNumber = Number(skuQuantity);
    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      pushError('skuQuantity', skuQuantity, ERROR_CODES.QUANTITY_NOT_POSITIVE, '数量必须为大于 0 的数字');
    }
  }

  if (validSkus !== 'degraded' && skuCode && !validSkus.has(skuCode)) {
    pushError('skuCode', skuCode, ERROR_CODES.SKU_NOT_FOUND, `SKU ${skuCode} 不存在于商品主数据`);
  }

  if (externalOrderNo) {
    const count = seenKeys.get(externalOrderNo) ?? 0;
    seenKeys.set(externalOrderNo, count + 1);
    const lineNo = count + 1;
    if (count > 0 || existingKeys.has(externalOrderNo)) {
      pushError(
        'externalCode',
        externalOrderNo,
        ERROR_CODES.DUPLICATE_EXTERNAL,
        `外部单号 ${externalOrderNo} 重复`
      );
    }
  }

  const hasErrors = errorsOut.length > errorStart;
  if (hasErrors) return null;

  const lineNo = (seenKeys.get(externalOrderNo) ?? 1) as number;
  return {
    externalOrderNo,
    storeName: clean(record.storeName),
    receiverName,
    receiverPhone,
    receiverAddress: clean(record.receiverAddress),
    remark: clean(record.remark),
    skuCode,
    skuName: clean(record.skuName),
    skuQuantity: quantityNumber ? String(quantityNumber) : '',
    skuSpec: clean(record.skuSpec),
    lineNo,
    rowNumber,
  };
}

export async function validateBatch(
  records: ParsedRecord[],
  task: TaskRow,
  ruleName: string,
  options: { skuLoader?: SkuLoader; existingKeys?: Set<string> } = {}
): Promise<ValidationOutcome> {
  const codes = records.map((r) => clean(r.skuCode)).filter(Boolean);
  const validSkus = await loadSkuSet(codes, task, options.skuLoader);
  const skuValidationSkipped = validSkus === 'degraded';

  let existingKeys = options.existingKeys ?? new Set<string>();
  if (existingKeys.size === 0) {
    const orderNos = records.map((r) => clean(r.externalCode)).filter(Boolean);
    if (orderNos.length > 0) {
      const found = await db
        .select({ externalOrderNo: waybills.externalOrderNo })
        .from(waybills)
        .where(inArray(waybills.externalOrderNo, [...new Set(orderNos)]));
      existingKeys = new Set(found.map((r) => r.externalOrderNo));
    }
  }

  const errors: RowError[] = [];
  const seenKeys = new Map<string, number>();
  const rows: NormalizedRow[] = [];

  for (const record of records) {
    const before = errors.length;
    const row = validateRecord(record, ruleName, existingKeys, validSkus, seenKeys, errors, before);
    if (row && errors.length === before) rows.push(row);
  }

  return { rows, errors, skuValidationSkipped };
}
