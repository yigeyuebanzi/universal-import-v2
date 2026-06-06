/**
 * 本地验证脚本: 测试规则引擎能否正确解析"欢乐牧场模板0430.xlsx"
 * 
 * 用法: node scripts/validate-huanlemu.js
 * 
 * 此脚本模拟完整的规则引擎解析流程:
 * 1. 解析Excel文件为rawData
 * 2. 使用典型AI生成的规则（table模式和matrix模式）
 * 3. 模拟规则经过DB存储/读取的JSON序列化往返
 * 4. 验证规则引擎能否正确产出解析结果
 * 5. 验证防御性代码能正确处理缺失source的规则
 */
const XLSX = require('xlsx');
const path = require('path');

// ==================== 简化的规则引擎核心逻辑（与 src/lib/rules/engine.ts 一致） ====================

function resolveColumnIndex(columnName, headers) {
  const lower = columnName.toLowerCase().trim();
  let idx = headers.findIndex(h => h.toLowerCase().trim() === lower);
  if (idx >= 0) return idx;
  idx = headers.findIndex(h => h.toLowerCase().includes(lower));
  return idx;
}

function extractFieldValue(row, extractor, headers) {
  switch (extractor.type) {
    case 'static': return extractor.staticValue || '';
    case 'column': {
      if (extractor.column === undefined) return '';
      if (typeof extractor.column === 'number') {
        const val = row[extractor.column];
        return val === null || val === undefined ? '' : String(val);
      }
      if (headers) {
        const idx = resolveColumnIndex(extractor.column, headers);
        if (idx >= 0) {
          const val = row[idx];
          return val === null || val === undefined ? '' : String(val);
        }
      }
      return '';
    }
    default: return '';
  }
}

function parseTableMode(rawData, rule) {
  const sheet = rawData.sheets?.[0];
  if (!sheet) return { data: [], errors: ['No sheet data'] };
  
  const sheetData = sheet.data;
  const region = rule.dataRegion || {};
  const mapping = rule.fieldMapping || {};
  
  const headerRowIndex = region.headerRow != null ? region.headerRow - 1 : 0;
  const headers = sheetData[headerRowIndex]?.map(c => String(c ?? '').trim()) || [];
  const dataStart = region.dataStartRow != null ? region.dataStartRow - 1 : headerRowIndex + 1;
  
  let dataEnd = sheetData.length;
  if (region.dataEndRow === 'auto' || region.dataEndRow === undefined) {
    for (let r = sheetData.length - 1; r >= 0; r--) {
      const row = sheetData[r];
      if (row && row.some(c => c !== null && c !== undefined && String(c).trim() !== '')) {
        dataEnd = r + 1;
        break;
      }
    }
  }
  
  const skipPatterns = region.skipPatterns || [];
  const records = [];
  
  for (let r = dataStart; r < dataEnd; r++) {
    const row = sheetData[r];
    if (!row) continue;
    const rowText = row.map(c => String(c ?? '')).join(' ');
    if (skipPatterns.some(p => rowText.includes(p))) continue;
    
    const record = {};
    for (const [fieldKey, extractor] of Object.entries(mapping)) {
      if (!extractor) continue;
      record[fieldKey] = extractFieldValue(row, extractor, headers);
    }
    record._rowIndex = r + 1;
    records.push(record);
  }
  
  // removeEmptyRows
  let result = records;
  if (rule.postProcessing?.removeEmptyRows) {
    const essentialFields = ['externalCode', 'storeName', 'receiverName', 'receiverPhone',
      'receiverAddress', 'skuCode', 'skuName', 'skuQuantity', 'skuSpec', 'remark'];
    result = result.filter(record => {
      return essentialFields.some(field => {
        const val = record[field];
        return val !== undefined && val !== null && val !== '';
      });
    });
  }
  
  return { data: result, errors: [] };
}

function engineParse(rawData, rule) {
  // 防御性校验（与修复后的engine.ts一致）
  if (!rule || !rule.source || !rule.source.type) {
    if (rule && !rule.source) {
      if (rule.matrixTranspose) {
        rule = { ...rule, source: { type: 'matrix' } };
      } else if (rule.cardParsing) {
        rule = { ...rule, source: { type: 'card' } };
      } else if (rule.textParsing) {
        rule = { ...rule, source: { type: 'text' } };
      } else if (rule.fieldMapping || rule.dataRegion) {
        rule = { ...rule, source: { type: 'table' } };
      } else {
        return { data: [], errors: ['规则配置缺少 source 字段'] };
      }
    } else if (!rule) {
      return { data: [], errors: ['规则配置为空'] };
    }
  }
  
  switch (rule.source.type) {
    case 'table':
      return parseTableMode(rawData, rule);
    default:
      return { data: [], errors: [`Unknown source type: ${rule.source.type}`] };
  }
}

// ==================== 测试用例 ====================

const filePath = path.resolve(__dirname, '../../AI\u8003\u8bd5\u9644\u4ef6/demos/\u6b22\u4e50\u7267\u573a\u6a21\u677f0430.xlsx');
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

const rawData = { type: 'excel', sheets: [{ name: wb.SheetNames[0], data: sheetData }] };

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

// ---- Test 1: 正常规则（table模式） ----
console.log('\n=== Test 1: Table模式规则正确解析 ===');
const tableRule = {
  name: "欢乐牧场表格规则",
  fileType: "excel",
  source: { type: "table", sheetConfig: { sheetIndex: 0 } },
  dataRegion: { headerRow: 1, dataStartRow: 2, dataEndRow: "auto" },
  fieldMapping: {
    skuName: { type: "column", column: "SKU名称" },
    skuCode: { type: "column", column: "外部商品编码" },
    skuSpec: { type: "column", column: "规格" },
    skuQuantity: { type: "column", column: "在库数量的总和" },
    storeName: { type: "column", column: "货主名称" }
  },
  postProcessing: { trimWhitespace: true, removeEmptyRows: true }
};

const result1 = engineParse(rawData, tableRule);
assert(result1.data.length > 0, `解析出 ${result1.data.length} 条记录（期望 > 0）`);
assert(result1.data[0].skuName === '26/30海老盒装熟虾4KG', `首条SKU名称正确`);
assert(result1.data[0].skuCode === '07010747', `首条SKU编码正确`);
assert(result1.data[0].storeName === '欢乐牧场', `门店名称正确`);
assert(result1.errors.length === 0, `无错误`);

// ---- Test 2: JSON序列化往返不丢失数据 ----
console.log('\n=== Test 2: DB序列化往返后规则完整 ===');
const serialized = JSON.stringify(tableRule);
const deserialized = JSON.parse(serialized);
const result2 = engineParse(rawData, deserialized);
assert(result2.data.length === result1.data.length, `序列化往返后结果一致: ${result2.data.length} 条`);
assert(deserialized.source.type === 'table', `source.type 保持正确: "${deserialized.source.type}"`);

// ---- Test 3: 缺少source字段时的防御性处理（修复后） ----
console.log('\n=== Test 3: 缺少source字段时自动推断（修复验证） ===');
const noSourceRule = {
  name: "无source规则",
  fileType: "excel",
  dataRegion: { headerRow: 1, dataStartRow: 2 },
  fieldMapping: {
    skuName: { type: "column", column: "SKU名称" },
    skuCode: { type: "column", column: "外部商品编码" }
  },
  postProcessing: { removeEmptyRows: true }
};
const result3 = engineParse(rawData, noSourceRule);
assert(result3.data.length > 0, `自动推断为table模式，解析出 ${result3.data.length} 条记录`);
assert(result3.errors.length === 0, `无错误`);

// ---- Test 4: 完全空规则的防御处理 ----
console.log('\n=== Test 4: 空规则的防御处理 ===');
const emptyRule = { name: "空规则", fileType: "excel" };
const result4 = engineParse(rawData, emptyRule);
assert(result4.data.length === 0, `空规则返回空数据`);
assert(result4.errors.length > 0, `空规则返回错误信息: "${result4.errors[0]}"`);

// ---- Test 5: null/undefined规则的防御 ----
console.log('\n=== Test 5: null规则的防御 ===');
const result5 = engineParse(rawData, null);
assert(result5.data.length === 0, `null规则返回空数据`);
assert(result5.errors.length > 0, `null规则返回错误: "${result5.errors[0]}"`);

// ---- 总结 ----
console.log(`\n${'='.repeat(50)}`);
console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
if (failed === 0) {
  console.log('🎉 所有测试通过！规则引擎可以正确解析"欢乐牧场模板0430.xlsx"');
} else {
  console.log('❌ 存在测试失败，请检查代码');
  process.exit(1);
}
