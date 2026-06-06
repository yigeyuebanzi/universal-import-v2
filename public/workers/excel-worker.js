// Web Worker for Excel parsing
// 在worker线程中解析Excel，不阻塞UI主线程
// 优先尝试CDN加载，失败后使用内联解析
let XLSX_LIB = null;
let libReady = false;
let libError = null;

// 尝试从CDN加载SheetJS
try {
  importScripts('https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js');
  if (typeof XLSX !== 'undefined') {
    XLSX_LIB = XLSX;
    libReady = true;
  }
} catch (e) {
  libError = e;
}

// 如果CDN加载失败，通知主线程，由主线程提供解析逻辑
if (!libReady) {
  self.postMessage({ type: 'lib-load-failed', error: libError?.message || 'CDN load failed' });
}

self.onmessage = function(e) {
  const { buffer, options, libCode } = e.data;

  // 如果主线程传入了lib代码（CDN失败时的备用方案）
  if (libCode && !libReady) {
    try {
      // 使用eval在worker作用域内执行库代码
      self.importScripts_lib = libCode;
      // 通过Function构造器安全执行
      const fn = new Function(libCode);
      fn.call(self);
      if (typeof XLSX !== 'undefined') {
        XLSX_LIB = XLSX;
        libReady = true;
      }
    } catch (e) {
      self.postMessage({ success: false, error: 'Worker lib init failed: ' + e.message });
      return;
    }
  }

  if (!libReady) {
    self.postMessage({ success: false, error: 'XLSX library not loaded' });
    return;
  }

  try {
    const workbook = XLSX_LIB.read(buffer, { type: 'array' });
    const sheets = [];
    const sheetNames = options?.allSheets
      ? workbook.SheetNames
      : [workbook.SheetNames[options?.sheetIndex || 0]];

    for (const name of sheetNames) {
      if (!name) continue;
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const data = XLSX_LIB.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
      sheets.push({ name, data });
    }

    self.postMessage({ success: true, data: { type: 'excel', sheets } });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};
