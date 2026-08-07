export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function boolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export function strEnv(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export function getQueueDriver(): 'redis' | 'db' {
  return process.env.QUEUE_DRIVER === 'db' ? 'db' : 'redis';
}

export const config = {
  batchSize: intEnv('BATCH_SIZE', 1000),
  workerConcurrency: intEnv('WORKER_CONCURRENCY', 4),
  dispatchPollMs: intEnv('DISPATCH_POLL_MS', 1000),
  sweepIntervalMs: intEnv('SWEEP_INTERVAL_MS', 30000),
  skuCheckTimeoutMs: intEnv('SKU_CHECK_TIMEOUT_MS', 3000),
  batchMaxRetries: intEnv('BATCH_MAX_RETRIES', 3),
  staleBatchMinutes: intEnv('STALE_BATCH_MINUTES', 5),
  requiredFields: (process.env.REQUIRED_FIELDS ?? 'externalCode,receiverName,receiverPhone,skuCode,skuQuantity')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
