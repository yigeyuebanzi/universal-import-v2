/**
 * Web Worker客户端，用于前端大文件解析
 * 返回Promise，在Worker线程中执行Excel解析
 * 支持CDN加载失败时自动回退到主线程分批解析
 */
import * as XLSX from 'xlsx';
import type { RawFileData, RawSheet } from './types';

export interface ExcelWorkerOptions {
  allSheets?: boolean;
  sheetIndex?: number;
}

/**
 * 主线程分批解析（Worker不可用时的fallback）
 * 使用requestIdleCallback分批处理避免阻塞UI
 */
function parseExcelMainThread(
  buffer: ArrayBuffer,
  options?: ExcelWorkerOptions
): Promise<RawFileData> {
  return new Promise((resolve) => {
    const parse = () => {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetNames = options?.allSheets
        ? workbook.SheetNames
        : [workbook.SheetNames[options?.sheetIndex ?? 0]];

      const sheets: RawSheet[] = [];
      for (const name of sheetNames) {
        if (!name) continue;
        const sheet = workbook.Sheets[name];
        if (!sheet) continue;
        const data = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
          header: 1,
          defval: null,
          raw: false,
        });
        sheets.push({ name, data });
      }

      resolve({ type: 'excel', sheets });
    };

    // 使用requestIdleCallback避免阻塞UI
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(parse, { timeout: 1000 });
    } else {
      setTimeout(parse, 0);
    }
  });
}

/**
 * 在Web Worker中解析Excel，失败时自动回退到主线程
 */
export function parseExcelInWorker(
  buffer: ArrayBuffer,
  options?: ExcelWorkerOptions
): Promise<RawFileData> {
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;
    let settled = false;

    const fallbackToMainThread = () => {
      if (settled) return;
      console.warn('[ExcelWorker] Worker不可用，回退到主线程解析');
      parseExcelMainThread(buffer, options).then(resolve).catch(reject);
    };

    // 5秒超时，自动fallback
    const timeout = setTimeout(() => {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      fallbackToMainThread();
    }, 5000);

    try {
      worker = new Worker('/workers/excel-worker.js');

      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;

        // CDN加载失败，尝试把主线程的xlsx传给worker
        if (msg.type === 'lib-load-failed') {
          console.warn('[ExcelWorker] CDN加载失败，尝试注入本地库');
          // 直接回退到主线程（传递大量库代码给worker不可靠）
          clearTimeout(timeout);
          fallbackToMainThread();
          return;
        }

        if (msg.success) {
          settled = true;
          clearTimeout(timeout);
          resolve(msg.data as RawFileData);
        } else {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(msg.error));
        }
        if (worker) {
          worker.terminate();
          worker = null;
        }
      };

      worker.onerror = (e: ErrorEvent) => {
        settled = true;
        clearTimeout(timeout);
        if (worker) {
          worker.terminate();
          worker = null;
        }
        // Worker加载失败，fallback到主线程
        fallbackToMainThread();
      };

      worker.postMessage({ buffer, options });
    } catch {
      clearTimeout(timeout);
      fallbackToMainThread();
    }
  });
}
