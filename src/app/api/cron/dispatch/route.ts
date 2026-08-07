import { NextResponse } from 'next/server';
import { dispatchPendingOutbox } from '@/lib/import/dispatcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dispatched = await dispatchPendingOutbox(100);
  return NextResponse.json({ ok: true, dispatched });
}
