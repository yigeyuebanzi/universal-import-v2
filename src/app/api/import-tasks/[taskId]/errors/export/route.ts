import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTaskErrors } from '@/lib/db/schema';
import { checkApiKey } from '@/lib/auth';
import { isValidTaskId } from '@/lib/ids';

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

  const rows = await db
    .select()
    .from(importTaskErrors)
    .where(eq(importTaskErrors.taskId, taskId))
    .orderBy(asc(importTaskErrors.rowNumber));

  const header = [
    'task_id',
    'batch_index',
    'row_number',
    'field_name',
    'raw_value',
    'error_code',
    'error_reason',
    'suggestion',
    'trace_id',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.taskId,
        r.batchIndex,
        r.rowNumber,
        r.fieldName ?? '',
        `"${(r.rawValue ?? '').replaceAll('"', '""')}"`,
        r.errorCode,
        `"${r.errorReason.replaceAll('"', '""')}"`,
        `"${(r.suggestion ?? '').replaceAll('"', '""')}"`,
        r.traceId,
      ].join(',')
    );
  }

  return new NextResponse('\uFEFF' + lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="task-${taskId}-errors.csv"`,
    },
  });
}
