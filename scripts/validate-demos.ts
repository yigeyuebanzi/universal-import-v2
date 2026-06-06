/**
 * 9份demo文件规则适配验证脚本
 * 逐一加载文件、匹配规则、解析数据，输出验证结果
 *
 * 使用: npx tsx scripts/validate-demos.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

import { RuleEngine } from '../src/lib/rules/engine';
import type { ParseRule, RawFileData } from '../src/lib/rules/types';
import { presetRules, matchPresetRule } from '../src/lib/rules/presets';

// ==================== 配置 ====================

const DEMO_DIR = 'D:\\workSpace\\shengtai\\ai\\AI考试附件\\demos';
const ruleEngine = new RuleEngine();

// 预期9份文件（排除临时文件和package.json）
const EXPECTED_FILES = [
  '12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx',
  '周配送计划.xlsx',
  '多门店分Sheet出库单.xlsx',
  '欢乐牧场模板0430.xlsx',
  '湖南仓.xlsx',
  '门店调拨单-卡片式.xlsx',
  '门店配送确认单.docx',
  '配送签收单-多单.pdf',
  '黔寨寨贵州烙锅（鞍山店）常温.pdf',
];

// ==================== 文件解析 ====================

async function parseFileToRawData(filePath: string): Promise<RawFileData> {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  switch (ext) {
    case '.xlsx':
    case '.xls': {
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheets = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        if (!ws) return { name, data: [] };
        const data = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(ws, {
          header: 1,
          defval: null,
          raw: false,
        });
        return { name, data };
      });
      return { type: 'excel', sheets };
    }

    case '.docx': {
      const result = await mammoth.extractRawText({ buffer });
      return { type: 'word', text: result.value };
    }

    case '.pdf': {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const textResult = await parser.getText();
        const pages = textResult.pages.map((p: { text: string }) => p.text);
        return { type: 'pdf', text: textResult.text, pages };
      } finally {
        await parser.destroy();
      }
    }

    default:
      throw new Error(`不支持的文件类型: ${ext}`);
  }
}

// ==================== 验证逻辑 ====================

interface ValidationResult {
  fileName: string;
  ruleId: string;
  ruleName: string;
  matched: boolean;
  success: boolean;
  totalRows: number;
  parsedRows: number;
  errors: string[];
  fieldCoverage: Record<string, number>;
  sampleRecords: Record<string, string>[];
}

function checkFieldCoverage(records: Record<string, unknown>[]): Record<string, number> {
  if (records.length === 0) return {};

  const fields = ['externalCode', 'storeName', 'receiverName', 'receiverPhone',
    'receiverAddress', 'skuCode', 'skuName', 'skuQuantity', 'skuSpec', 'remark'];

  const coverage: Record<string, number> = {};
  for (const field of fields) {
    const filled = records.filter((r) => {
      const val = r[field];
      return val !== undefined && val !== null && val !== '';
    }).length;
    coverage[field] = Math.round((filled / records.length) * 100);
  }
  return coverage;
}

async function validateFile(fileName: string): Promise<ValidationResult> {
  const filePath = path.join(DEMO_DIR, fileName);
  const result: ValidationResult = {
    fileName,
    ruleId: '',
    ruleName: '',
    matched: false,
    success: false,
    totalRows: 0,
    parsedRows: 0,
    errors: [],
    fieldCoverage: {},
    sampleRecords: [],
  };

  // 1. 匹配规则
  const rule = matchPresetRule(fileName);
  if (!rule) {
    result.errors.push('未找到匹配的预设规则');
    return result;
  }
  result.ruleId = rule.id;
  result.ruleName = rule.name;
  result.matched = true;

  // 2. 解析文件
  let rawData: RawFileData;
  try {
    rawData = await parseFileToRawData(filePath);
  } catch (e) {
    result.errors.push(`文件解析失败: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  // 3. 应用规则引擎
  try {
    const parseResult = ruleEngine.parse(rawData, rule);
    result.success = parseResult.success;
    result.totalRows = parseResult.totalRows ?? 0;
    result.parsedRows = parseResult.parsedRows ?? 0;
    result.errors = parseResult.errors ?? [];

    // 4. 字段覆盖率
    const records = parseResult.data as Record<string, unknown>[];
    result.fieldCoverage = checkFieldCoverage(records);

    // 5. 样本记录（取前3条）
    result.sampleRecords = records.slice(0, 3).map((r) => {
      const sample: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k.startsWith('_')) continue;
        sample[k] = String(v ?? '');
      }
      return sample;
    });
  } catch (e) {
    result.errors.push(`规则引擎执行失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}

// ==================== 主流程 ====================

async function main() {
  console.log('='.repeat(70));
  console.log('  9份Demo文件规则适配验证');
  console.log('='.repeat(70));
  console.log();

  const results: ValidationResult[] = [];
  let passCount = 0;
  let failCount = 0;

  for (const fileName of EXPECTED_FILES) {
    console.log(`\n📄 验证: ${fileName}`);
    console.log('-'.repeat(50));

    const result = await validateFile(fileName);
    results.push(result);

    // 输出结果
    if (result.matched) {
      console.log(`  ✅ 规则匹配: ${result.ruleName} (${result.ruleId})`);
    } else {
      console.log(`  ❌ 规则匹配: 未找到`);
    }

    if (result.success) {
      console.log(`  ✅ 解析成功: 总行数=${result.totalRows}, 有效行数=${result.parsedRows}`);
      passCount++;
    } else {
      console.log(`  ❌ 解析失败: 总行数=${result.totalRows}`);
      failCount++;
    }

    if (result.errors.length > 0) {
      console.log(`  ⚠️  错误信息:`);
      for (const err of result.errors) {
        console.log(`     - ${err}`);
      }
    }

    // 字段覆盖率
    const filledFields = Object.entries(result.fieldCoverage)
      .filter(([, pct]) => pct > 0)
      .map(([field, pct]) => `${field}:${pct}%`);
    if (filledFields.length > 0) {
      console.log(`  📊 字段覆盖: ${filledFields.join(', ')}`);
    }

    // 样本数据
    if (result.sampleRecords.length > 0) {
      console.log(`  📋 样本数据 (第1条):`);
      const sample = result.sampleRecords[0];
      for (const [k, v] of Object.entries(sample)) {
        if (v) console.log(`     ${k}: ${v}`);
      }
    }
  }

  // ==================== 汇总 ====================
  console.log('\n' + '='.repeat(70));
  console.log('  验证汇总');
  console.log('='.repeat(70));
  console.log(`  总文件数: ${EXPECTED_FILES.length}`);
  console.log(`  通过: ${passCount}`);
  console.log(`  失败: ${failCount}`);
  console.log();

  // 检查每份文件是否至少解析出1条有效数据
  const noDataFiles = results.filter((r) => r.totalRows === 0);
  if (noDataFiles.length > 0) {
    console.log('  ⚠️  以下文件未解析出有效数据:');
    for (const f of noDataFiles) {
      console.log(`     - ${f.fileName}`);
    }
  }

  // 解析模式覆盖检查
  const parseModes = new Set(presetRules.map((r) => r.source.type));
  console.log(`  解析模式覆盖: ${[...parseModes].join(', ')}`);
  const requiredModes = ['table', 'matrix', 'card', 'text', 'multi-sheet'];
  const missingModes = requiredModes.filter((m) => !parseModes.has(m as ParseRule['source']['type']));
  if (missingModes.length > 0) {
    console.log(`  ⚠️  未覆盖的模式: ${missingModes.join(', ')}`);
  } else {
    console.log(`  ✅ 所有5种解析模式均已覆盖`);
  }

  // 最终判定
  const allPassed = passCount === EXPECTED_FILES.length && noDataFiles.length === 0 && missingModes.length === 0;
  console.log();
  if (allPassed) {
    console.log('  🎉 验证全部通过！');
  } else {
    console.log('  ❌ 验证存在未通过项，请检查上述错误。');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error('验证脚本执行失败:', e);
  process.exit(1);
});
