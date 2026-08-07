import { NextResponse } from 'next/server';
import { and, asc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTaskErrors, importTasks, traceEvents } from '@/lib/db/schema';
import { checkApiKey } from '@/lib/auth';

export async function GET(request: Request) {
  const authError = checkApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const taskId = url.searchParams.get('task_id')?.trim();
  const traceId = url.searchParams.get('trace_id')?.trim();
  const fileName = url.searchParams.get('file_name')?.trim();
  const batch = url.searchParams.get('batch');
  const rowFrom = url.searchParams.get('row_from');
  const rowTo = url.searchParams.get('row_to');
  const errorCode = url.searchParams.get('error_code')?.trim();
  const limit = Math.min(100, Number(url.searchParams.get('limit') ?? 20));

  const taskConditions = [];
  if (taskId) taskConditions.push(eq(importTasks.id, taskId));
  if (traceId) taskConditions.push(eq(importTasks.traceId, traceId));
  if (fileName) taskConditions.push(ilike(importTasks.fileName, `%${fileName}%`));

  let tasks: { id: string; traceId: string; fileName: string; status: string }[] = [];
  if (taskConditions.length === 0) {
    tasks = await db
      .select({
        id: importTasks.id,
        traceId: importTasks.traceId,
        fileName: importTasks.fileName,
        status: importTasks.status,
      })
      .from(importTasks)
      .orderBy(descCreatedAt())
      .limit(limit);
  } else {
    tasks = await db
      .select({
        id: importTasks.id,
        traceId: importTasks.traceId,
        fileName: importTasks.fileName,
        status: importTasks.status,
      })
      .from(importTasks)
      .where(and(...taskConditions))
      .orderBy(descCreatedAt())
      .limit(limit);
  }

  const taskIds = tasks.map((t) => t.id);
  const traceIds = tasks.map((t) => t.traceId);

  const errorConditions: any[] = [];
  if (taskIds.length > 0) errorConditions.push(inArray(importTaskErrors.taskId, taskIds));
  if (batch) errorConditions.push(eq(importTaskErrors.batchIndex, Number(batch)));
  if (rowFrom) errorConditions.push(gte(importTaskErrors.rowNumber, Number(rowFrom)));
  if (rowTo) errorConditions.push(lte(importTaskErrors.rowNumber, Number(rowTo)));
  if (errorCode) errorConditions.push(eq(importTaskErrors.errorCode, errorCode));

  const errors =
    errorConditions.length > 0
      ? await db
          .select()
          .from(importTaskErrors)
          .where(and(...errorConditions))
          .orderBy(asc(importTaskErrors.rowNumber))
          .limit(200)
      : [];

  const eventConditions: any[] = [];
  if (traceIds.length > 0) eventConditions.push(inArray(traceEvents.traceId, traceIds));
  const unitIds = [...new Set(errors.map((e) => e.unitId).filter(Boolean))];
  if (unitIds.length > 0 && taskIds.length > 0) {
    eventConditions.push(
      or(inArray(traceEvents.taskId, taskIds), inArray(traceEvents.unitId, unitIds))
    );
  }

  const events =
    eventConditions.length > 0
      ? await db
          .select()
          .from(traceEvents)
          .where(and(...eventConditions))
          .orderBy(asc(traceEvents.occurredAt))
          .limit(500)
      : [];

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      trace_id: t.traceId,
      file_name: t.fileName,
      status: t.status,
    })),
    errors: errors.map((e) => ({
      id: e.id,
      task_id: e.taskId,
      unit_id: e.unitId,
      batch_index: e.batchIndex,
      row_number: e.rowNumber,
      field_name: e.fieldName,
      raw_value: e.rawValue,
      error_code: e.errorCode,
      error_reason: e.errorReason,
      trace_id: e.traceId,
    })),
    events: events.map((e) => ({
      id: e.id,
      trace_id: e.traceId,
      task_id: e.taskId,
      unit_id: e.unitId,
      event_name: e.eventName,
      event_status: e.eventStatus,
      message: e.message,
      occurred_at: e.occurredAt,
    })),
  });
}

function descCreatedAt() {
  return sql`${importTasks.createdAt} DESC`;
}
