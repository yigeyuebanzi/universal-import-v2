import { Queue, Worker, type Job, type Processor } from 'bullmq';
import IORedis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { config } from '@/lib/config';

export const IMPORT_QUEUE = 'import-batch';

export interface BatchJobPayload {
  taskId: string;
  unitId: string;
  batchIndex: number;
  startRow: number;
  endRow: number;
  traceId: string;
  fileRef: string;
  fileType: 'excel' | 'word' | 'pdf';
  ruleId: string | null;
}

export function redisConnectionOptions(): RedisOptions {
  const fromUrl =
    process.env.REDIS_URL && !process.env.REDIS_HOST
      ? (() => {
          try {
            const u = new URL(process.env.REDIS_URL!);
            return {
              host: u.hostname,
              port: Number(u.port || 6379),
              password: u.password ? decodeURIComponent(u.password) : undefined,
              tls: u.protocol === 'rediss:' ? {} : undefined,
            };
          } catch {
            return {};
          }
        })()
      : {};
  return {
    host: fromUrl.host ?? process.env.REDIS_HOST ?? 'localhost',
    port: fromUrl.port ?? Number(process.env.REDIS_PORT ?? 6379),
    password: fromUrl.password ?? (process.env.REDIS_PASSWORD || undefined),
    tls: fromUrl.tls ?? (process.env.REDIS_TLS === 'true' ? {} : undefined),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

let sharedQueue: Queue | null = null;
let sharedConnection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!sharedConnection) {
    sharedConnection = new IORedis(redisConnectionOptions());
  }
  return sharedConnection;
}

export function getImportQueue(): Queue {
  if (!sharedQueue) {
    sharedQueue = new Queue(IMPORT_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: config.batchMaxRetries,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 2000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return sharedQueue;
}

export function createImportWorker(processor: Processor<BatchJobPayload>): Worker {
  return new Worker(IMPORT_QUEUE, processor, {
    connection: getRedisConnection(),
    concurrency: config.workerConcurrency,
  });
}

export async function enqueueBatch(payload: BatchJobPayload): Promise<Job<BatchJobPayload>> {
  return getImportQueue().add(IMPORT_QUEUE, payload, {
    jobId: `${payload.taskId}-${payload.unitId}`,
  });
}

export async function closeQueue(): Promise<void> {
  await sharedQueue?.close();
  sharedQueue = null;
  if (sharedConnection) {
    await sharedConnection.quit().catch(() => undefined);
    sharedConnection = null;
  }
}
