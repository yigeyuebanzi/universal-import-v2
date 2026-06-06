/**
 * 性能测试数据生成脚本
 * 生成1000行标准Excel数据用于性能测试
 * 使用: npx tsx scripts/generate-test-data.ts
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// 生成1000行标准数据
const data = [];
for (let i = 1; i <= 1000; i++) {
  data.push({
    '外部编码': `ORDER-${String(i).padStart(5, '0')}`,
    '收货门店': `测试门店${i % 50 + 1}`,
    '收件人姓名': `测试用户${i}`,
    '收件人电话': `1380000${String(i).padStart(4, '0')}`,
    '收件人地址': `测试地址${i}号`,
    '物品编码': `SKU${String(i % 200 + 1).padStart(4, '0')}`,
    '物品名称': `测试商品${i % 200 + 1}`,
    '发货数量': Math.floor(Math.random() * 100) + 1,
    '规格型号': `规格${i % 10 + 1}`,
    '备注': i % 5 === 0 ? `备注信息${i}` : '',
  });
}

const ws = XLSX.utils.json_to_sheet(data);

// 设置列宽
ws['!cols'] = [
  { wch: 18 }, // 外部编码
  { wch: 16 }, // 收货门店
  { wch: 14 }, // 收件人姓名
  { wch: 16 }, // 收件人电话
  { wch: 18 }, // 收件人地址
  { wch: 14 }, // 物品编码
  { wch: 16 }, // 物品名称
  { wch: 10 }, // 发货数量
  { wch: 12 }, // 规格型号
  { wch: 16 }, // 备注
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '出库单');

const outputDir = path.join(__dirname, '..', 'test-data');
fs.mkdirSync(outputDir, { recursive: true });

const outputPath = path.join(outputDir, 'performance-test-1000.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`✅ 生成1000行测试Excel: ${outputPath}`);
console.log(`   文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
