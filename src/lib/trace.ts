import { db } from '@/lib/db';
import { traceEvents } from '@/lib/db/schema';

export type TraceLevel = 'info' | 'success' | 'warning' | 'error';

export interface TraceInput {
  traceId: string;
  taskId?: string;
  unitId?: string;
  eventName: string;
  eventStatus?: TraceLevel;
  message?: string;
}

export async function writeTrace(input: TraceInput): Promise<void> {
  try {
    await db.insert(traceEvents).values({
      traceId: input.traceId,
      taskId: input.taskId ?? null,
      unitId: input.unitId ?? null,
      eventName: input.eventName,
      eventStatus: input.eventStatus ?? 'info',
      message: input.message ?? null,
    });
  } catch (err) {
    // Trace recording must never break the import pipeline.
    console.error('[trace] failed to write trace event', err);
  }
}
