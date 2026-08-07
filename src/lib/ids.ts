import { randomUUID } from 'node:crypto';

export function newTaskId(): string {
  return `task_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

export function newTraceId(): string {
  return `trace_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
}

export function newEventId(): string {
  return `evt_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

export function unitIdFor(batchIndex: number): string {
  return `unit_${String(batchIndex).padStart(3, '0')}`;
}

export function isValidTaskId(value: string): boolean {
  return /^task_[a-zA-Z0-9]{8,32}$/.test(value);
}

export function isValidTraceId(value: string): boolean {
  return /^trace_[a-zA-Z0-9]{8,48}$/.test(value);
}
