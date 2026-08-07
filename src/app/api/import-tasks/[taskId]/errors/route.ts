import { NextResponse } from 'next/server';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTaskErrors } from '@/lib/db/schema';
import { checkApiKey } from '@/lib/auth';
import { isValidTaskId } from '@/lib/ids';
import { errorCodeLabel } from '@/lib/errors';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const authError = checkApiKey(request);
  if (authError) return authError;

  const { taskId } = await params;
  if (!isValidTaskId(taskId)) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get('page_size') ?? 50)));
  const batch = url.searchParams.get('batch');
  const errorCode = url.searchParams.get('error_code');
  const rowFrom = url.searchParams.get('row_from');
  const rowTo = url.searchParams.get('row_to');

  const conditions = [eq(importTaskErrors.taskId, taskId)];
  if (batch) conditions.push(eq(importTaskErrors.batchIndex, Number(batch)));
  if (errorCode) conditions.push(eq(importTaskErrors.errorCode, errorCode));
  if (rowFrom) conditions.push(gte(importTaskErrors.rowNumber, Number(rowFrom)));
  if (rowTo) conditions.push(lte(importTaskErrors.rowNumber, Number(rowTo)));

  const where = and(...conditions);
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(importTaskErrors)
    .where(where);

  const rows = await db
    .select()
    .from(importTaskErrors)
    .where(where)
    .orderBy(asc(importTaskErrors.rowNumber), asc(importTaskErrors.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      task_id: r.taskId,
      unit_id: r.unitId,
      batch_index: r.batchIndex,
      row_number: r.rowNumber,
      field_name: r.fieldName,
      raw_value: r.rawValue,
      error_code: r.errorCode,
      error_code_label: errorCodeLabel(r.errorCode),
      error_reason: r.errorReason,
      rule_name: r.ruleName,
      retried: r.retried,
      suggestion: r.suggestion,
      trace_id: r.traceId,
      created_at: r.createdAt,
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    page_size: pageSize,
  });
}
