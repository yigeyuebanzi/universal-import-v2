import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve(__dirname, '../../AI考试附件/demos');

interface DeliveryItem {
  sku: string;
  name: string;
  spec: string;
  qty: number;
}

interface SignOrder {
  orderNo: string;
  store: string;
  receiver: string;
  phone: string;
  address: string;
  items: DeliveryItem[];
}

const orders: SignOrder[] = [
  {
    orderNo: 'DS2401150001',
    store: '尹三顺自助烤肉（银泰店）',
    receiver: '李明',
    phone: '13800138001',
    address: '杭州市西湖区银泰城B1层',
    items: [
      { sku: 'SKU0001', name: '精品肥牛卷500g', spec: '盒装', qty: 20 },
      { sku: 'SKU0002', name: '新鲜羊肉片300g', spec: '盒装', qty: 15 },
      { sku: 'SKU0003', name: '金针菇200g', spec: '袋装', qty: 30 },
    ],
  },
  {
    orderNo: 'DS2401150002',
    store: '海底捞（城西银泰店）',
    receiver: '王芳',
    phone: '13900139002',
    address: '杭州市西湖区城西银泰3楼',
    items: [
      { sku: 'SKU0004', name: '鲜毛肚200g', spec: '盒装', qty: 25 },
      { sku: 'SKU0005', name: '鸭血豆腐400g', spec: '盒装', qty: 40 },
      { sku: 'SKU0001', name: '精品肥牛卷500g', spec: '盒装', qty: 30 },
      { sku: 'SKU0006', name: '虾滑150g', spec: '盒装', qty: 20 },
    ],
  },
  {
    orderNo: 'DS2401150003',
    store: '呷哺呷哺（万象城店）',
    receiver: '赵强',
    phone: '13700137003',
    address: '杭州市江干区万象城4楼',
    items: [
      { sku: 'SKU0007', name: '手切羊肉250g', spec: '盒装', qty: 18 },
      { sku: 'SKU0008', name: '豆腐皮100g', spec: '袋装', qty: 50 },
      { sku: 'SKU0003', name: '金针菇200g', spec: '袋装', qty: 25 },
    ],
  },
];

// Register a Chinese font - use system font (SimHei is .ttf format, compatible with pdfkit)
const FONT_PATH = 'C:\\Windows\\Fonts\\simhei.ttf';

function drawTable(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  items: DeliveryItem[]
): number {
  const colWidths = [80, 180, 60, 60];
  const rowHeight = 22;
  const headerHeight = 26;
  const headers = ['物品编码', '物品名称', '规格', '数量'];

  let currentY = y;

  // Draw header row
  let currentX = x;
  for (let i = 0; i < headers.length; i++) {
    // Header background
    doc.rect(currentX, currentY, colWidths[i], headerHeight).fill('#E0E0E0').stroke();
    // Header text
    doc.fill('#000000').fontSize(10).text(headers[i], currentX + 4, currentY + 6, {
      width: colWidths[i] - 8,
      align: 'center',
    });
    currentX += colWidths[i];
  }
  currentY += headerHeight;

  // Draw data rows
  for (const item of items) {
    currentX = x;
    const rowData = [item.sku, item.name, item.spec, String(item.qty)];
    for (let i = 0; i < rowData.length; i++) {
      doc.rect(currentX, currentY, colWidths[i], rowHeight).stroke();
      doc.fill('#000000').fontSize(9).text(rowData[i], currentX + 4, currentY + 5, {
        width: colWidths[i] - 8,
        align: i === 3 ? 'center' : 'left',
      });
      currentX += colWidths[i];
    }
    currentY += rowHeight;
  }

  return currentY;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, '配送签收单-多单.pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // Register Chinese font
  if (fs.existsSync(FONT_PATH)) {
    doc.registerFont('Chinese', FONT_PATH);
  } else {
    console.warn('⚠️ 未找到微软雅黑字体，使用默认字体');
  }
  const fontName = fs.existsSync(FONT_PATH) ? 'Chinese' : 'Helvetica';

  const separator = '═'.repeat(55);

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];

    // Separator line at top
    doc.font(fontName).fontSize(12).text(separator, { align: 'center' });
    doc.moveDown(0.3);

    // Title
    doc.fontSize(16).text(`配送签收单 #${i + 1}`, { align: 'center' });
    doc.moveDown(0.3);

    // Separator line below title
    doc.fontSize(12).text(separator, { align: 'center' });
    doc.moveDown(0.8);

    // Order info
    doc.fontSize(11).text(`配送单号: ${order.orderNo}`);
    doc.text(`签收日期: 2024-01-15`);
    doc.moveDown(0.5);

    doc.text('收货信息:');
    doc.text(`  收货门店: ${order.store}`);
    doc.text(`  收货人: ${order.receiver}`);
    doc.text(`  联系电话: ${order.phone}`);
    doc.text(`  收货地址: ${order.address}`);
    doc.moveDown(0.5);

    doc.text('物品明细:');
    doc.moveDown(0.3);

    const tableY = doc.y;
    const tableEndY = drawTable(doc, 50, tableY, order.items);
    doc.y = tableEndY + 10;

    // Signature line
    doc.moveDown(1);
    doc.fontSize(11).text('签收人签名: ___________');
    doc.moveDown(1.5);
  }

  doc.end();

  await new Promise<void>((resolve) => {
    stream.on('finish', resolve);
  });

  console.log(`✅ PDF文件已生成: ${outputPath}`);
}

main().catch(console.error);
