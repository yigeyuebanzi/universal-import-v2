import { createImportWorker } from '@/lib/queue';
import { processBatchJob } from '@/lib/import/worker';
import { dispatchPendingOutbox } from '@/lib/import/dispatcher';
import { sweepStaleBatches, recoverLostOutboxEvents } from '@/lib/import/sweeper';
import { config } from '@/lib/config';

const worker = createImportWorker(async (job) => {
  await processBatchJob(job.data);
});

worker.on('completed', (job) => {
  console.log(`[worker] completed ${job.id}`);
});
worker.on('failed', (job, err) => {
  console.error(`[worker] failed ${job?.id}`, err.message);
});
worker.on('error', (err) => {
  console.error('[worker] queue error', err);
});

async function runDispatcher(): Promise<void> {
  try {
    const dispatched = await dispatchPendingOutbox(100);
    if (dispatched > 0) console.log(`[dispatcher] dispatched ${dispatched}`);
  } catch (err) {
    console.error('[dispatcher] error', err);
  } finally {
    setTimeout(runDispatcher, config.dispatchPollMs);
  }
}

async function runSweeper(): Promise<void> {
  try {
    const recovered = await sweepStaleBatches();
    const recreated = await recoverLostOutboxEvents();
    if (recovered > 0 || recreated > 0) {
      console.log(`[sweeper] recovered=${recovered} recreated=${recreated}`);
    }
  } catch (err) {
    console.error('[sweeper] error', err);
  } finally {
    setTimeout(runSweeper, config.sweepIntervalMs);
  }
}

runDispatcher();
runSweeper();

console.log(
  `[worker] import worker started (concurrency=${config.workerConcurrency}, batch_size=${config.batchSize})`
);

async function shutdown() {
  console.log('[worker] shutting down...');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
