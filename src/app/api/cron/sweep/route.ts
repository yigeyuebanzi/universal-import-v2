import { NextResponse } from 'next/server';
import { sweepStaleBatches, recoverLostOutboxEvents } from '@/lib/import/sweeper';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const recovered = await sweepStaleBatches();
  const recreated = await recoverLostOutboxEvents();
  return NextResponse.json({ ok: true, recovered, recreated });
}
