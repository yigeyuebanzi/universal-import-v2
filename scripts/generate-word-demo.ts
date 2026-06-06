import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve(__dirname, '../../AI考试附件/demos');

const separator = '━'.repeat(50);

interface DeliveryItem {
  index: number;
  sku: string;
  name: string;
  spec: string;
  qty: number;
}

interface DeliveryOrder {
  orderNo: string;
  store: string;
  receiver: string;
  phone: string;
  address: string;
  items: DeliveryItem[];
}

const orders: DeliveryOrder[] = [
  {
    orderNo: 'PS2401150001',
    store: '尹三顺自助烤肉（银泰店）',
    receiver: '李明',
    phone: '13800138001',
    address: '杭州市西湖区银泰城B1层',
    items: [
      { index: 1, sku: 'SKU0001', name: '精品肥牛卷500g', spec: '盒装', qty: 20 },
      { index: 2, sku: 'SKU0002', name: '新鲜羊肉片300g', spec: '盒装', qty: 15 },
      { index: 3, sku: 'SKU0003', name: '金针菇200g', spec: '袋装', qty: 30 },
    ],
  },
  {
    orderNo: 'PS2401150002',
    store: '海底捞（城西银泰店）',
    receiver: '王芳',
    phone: '13900139002',
    address: '杭州市西湖区城西银泰3楼',
    items: [
      { index: 1, sku: 'SKU0004', name: '鲜毛肚200g', spec: '盒装', qty: 25 },
      { index: 2, sku: 'SKU0005', name: '鸭血豆腐400g', spec: '盒装', qty: 40 },
      { index: 3, sku: 'SKU0001', name: '精品肥牛卷500g', spec: '盒装', qty: 30 },
      { index: 4, sku: 'SKU0006', name: '虾滑150g', spec: '盒装', qty: 20 },
    ],
  },
  {
    orderNo: 'PS2401150003',
    store: '呷哺呷哺（万象城店）',
    receiver: '赵强',
    phone: '13700137003',
    address: '杭州市江干区万象城4楼',
    items: [
      { index: 1, sku: 'SKU0007', name: '手切羊肉250g', spec: '盒装', qty: 18 },
      { index: 2, sku: 'SKU0008', name: '豆腐皮100g', spec: '袋装', qty: 50 },
      { index: 3, sku: 'SKU0003', name: '金针菇200g', spec: '袋装', qty: 25 },
    ],
  },
];

async function main() {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '门店配送确认单', bold: true, size: 36, font: '微软雅黑' })],
      alignment: 'center',
      spacing: { after: 200 },
    })
  );

  // Date and creator
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '日期：2024-01-15', size: 22, font: '微软雅黑' })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '制单人：张三', size: 22, font: '微软雅黑' })],
      spacing: { after: 100 },
    })
  );

  // Separator
  children.push(
    new Paragraph({
      children: [new TextRun({ text: separator, size: 22, font: '微软雅黑' })],
      spacing: { before: 100, after: 100 },
    })
  );

  // Delivery orders
  for (const order of orders) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `配送单号：${order.orderNo}`, size: 22, font: '微软雅黑' })],
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `收货门店：${order.store}`, size: 22, font: '微软雅黑' })],
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `收货人：${order.receiver}`, size: 22, font: '微软雅黑' })],
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `联系电话：${order.phone}`, size: 22, font: '微软雅黑' })],
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `收货地址：${order.address}`, size: 22, font: '微软雅黑' })],
        spacing: { after: 100 },
      })
    );

    children.push(
      new Paragraph({
        children: [new TextRun({ text: '物品明细：', bold: true, size: 22, font: '微软雅黑' })],
      })
    );

    for (const item of order.items) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${item.index}. ${item.sku} | ${item.name} | ${item.spec} | ${item.qty}`,
              size: 22,
              font: '微软雅黑',
            }),
          ],
          spacing: { before: 40, after: 40 },
        })
      );
    }

    // Separator after each order
    children.push(
      new Paragraph({
        children: [new TextRun({ text: separator, size: 22, font: '微软雅黑' })],
        spacing: { before: 100, after: 100 },
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, '门店配送确认单.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ Word文件已生成: ${outputPath}`);
}

main().catch(console.error);
