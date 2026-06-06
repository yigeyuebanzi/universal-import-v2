import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve(__dirname, '../../AI考试附件/demos');

interface CellData {
  store: string;
  days: { items: string }[]; // 5 days, Monday to Friday
}

const data: CellData[] = [
  {
    store: '尹三顺(银泰店)',
    days: [
      { items: '肥牛卷x20\n羊肉片x15' },
      { items: '金针菇x30' },
      { items: '' },
      { items: '肥牛卷x10\n鸭血x20' },
      { items: '' },
    ],
  },
  {
    store: '海底捞(城西店)',
    days: [
      { items: '毛肚x25\n鸭血x40' },
      { items: '' },
      { items: '肥牛卷x30\n虾滑x20' },
      { items: '' },
      { items: '毛肚x15' },
    ],
  },
  {
    store: '呷哺呷哺(万象城)',
    days: [
      { items: '' },
      { items: '羊肉x18\n豆腐皮x50' },
      { items: '金针菇x25' },
      { items: '' },
      { items: '羊肉x10' },
    ],
  },
];

function main() {
  const wb = XLSX.utils.book_new();

  // Create worksheet data
  const wsData: (string | number)[][] = [];

  // Row 1: Merged title
  wsData.push(['盛鼎食材公司周配送计划 2024年第3周', '', '', '', '', '']);

  // Row 2: Header row
  wsData.push(['', '周一(1/15)', '周二(1/16)', '周三(1/17)', '周四(1/18)', '周五(1/19)']);

  // Rows 3-5: Data rows
  for (const row of data) {
    const rowData: string[] = [row.store];
    for (const day of row.days) {
      rowData.push(day.items);
    }
    wsData.push(rowData);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 20 }, // Store column
    { wch: 22 }, // Monday
    { wch: 22 }, // Tuesday
    { wch: 22 }, // Wednesday
    { wch: 22 }, // Thursday
    { wch: 22 }, // Friday
  ];

  // Set row heights
  ws['!rows'] = [{ hpt: 30 }, { hpt: 20 }, { hpt: 40 }, { hpt: 40 }, { hpt: 40 }];

  // Merge cells for title row (A1:F1)
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

  // Style the title cell
  const titleCell = ws['A1'];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 16 },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }

  XLSX.utils.book_append_sheet(wb, ws, '周配送计划');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, '周配送计划.xlsx');
  XLSX.writeFile(wb, outputPath);
  console.log(`✅ Excel文件已生成: ${outputPath}`);
}

main();
