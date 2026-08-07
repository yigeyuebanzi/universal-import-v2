import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importTasks, traceEvents } from '@/lib/db/schema';
import { checkApiKey } from '@/lib/auth';
import { isValidTraceId } from '@/lib/ids';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const authError = checkApiKey(request);
  if (authError) return authError;

  const { traceId } = await params;
  if (!isValidTraceId(traceId)) {
    return NextResponse.json({ error: 'trace 不存在' }, { status: 404 });
  }

  const events = await db
    .select()
    .from(traceEvents)
    .where(eq(traceEvents.traceId, traceId))
    .orderBy(asc(traceEvents.occurredAt), asc(traceEvents.id));

  const tasks = await db
    .select({ id: importTasks.id, fileName: importTasks.fileName, status: importTasks.status })
    .from(importTasks)
    .where(eq(importTasks.traceId, traceId))
    .limit(10);

  return NextResponse.json({
    trace_id: traceId,
    tasks: tasks.map((t) => ({
      id: t.id,
      file_name: t.fileName,
      status: t.status,
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
