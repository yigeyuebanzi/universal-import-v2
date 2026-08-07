import ExcelJS from 'exceljs';
import { randomInt } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { skuMaster } from '@/lib/db/schema';

export interface GeneratedTestFile {
  filePath: string;
  rows: number;
  skuCount: number;
  invalidSkuRows: number;
  badPhoneRows: number;
  badQuantityRows: number;
  duplicateOrderRows: number;
}

function randomPhone(): string {
  return `1${[3, 5, 7, 8, 9][randomInt(5)]}${String(randomInt(1_000_000_000)).padStart(9, '0')}`;
}

/**
 * Generates test-data/10000-orders.xlsx using SKU codes from sku_master.
 * A few rows intentionally contain invalid SKUs / phone numbers / quantities /
 * duplicate order numbers to exercise the row-level error pipeline.
 */
export async function generateTestExcel(targetRows = 10_000): Promise<GeneratedTestFile> {
  const skus = await db.select({ skuCode: skuMaster.skuCode }).from(skuMaster).limit(20_000);
  if (skus.length < 20_000) {
    throw new Error(`sku_master 数据不足：需要至少 20,000 条，当前 ${skus.length} 条，请先运行 npm run seed`);
  }

  const rows = targetRows;
  const invalidSkuRows = 30;
  const badPhoneRows = 20;
  const badQuantityRows = 20;
  const duplicateOrderRows = 10;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('运单');
  sheet.columns = [
    { header: '外部单号', key: 'externalCode', width: 18 },
    { header: '门店名称', key: 'storeName', width: 16 },
    { header: '收货人', key: 'receiverName', width: 14 },
    { header: '手机号', key: 'receiverPhone', width: 16 },
    { header: '收货地址', key: 'receiverAddress', width: 32 },
    { header: 'SKU编码', key: 'skuCode', width: 14 },
    { header: 'SKU名称', key: 'skuName', width: 20 },
    { header: '数量', key: 'skuQuantity', width: 10 },
    { header: '规格', key: 'skuSpec', width: 12 },
    { header: '备注', key: 'remark', width: 16 },
  ];

  const stores = ['上海总仓', '杭州门店', '南京门店', '苏州门店'];
  const receivers = ['张三', '李四', '王五', '赵六', '钱七'];

  for (let i = 1; i <= rows; i++) {
    const sku = skus[randomInt(skus.length)].skuCode;
    const row: Record<string, unknown> = {
      externalCode: `ORDER_${String(i).padStart(5, '0')}`,
      storeName: stores[randomInt(stores.length)],
      receiverName: receivers[randomInt(receivers.length)],
      receiverPhone: randomPhone(),
      receiverAddress: `上海市浦东新区测试路${randomInt(1, 9999)}号`,
      skuCode: sku,
      skuName: `测试商品${i}`,
      skuQuantity: randomInt(1, 99),
      skuSpec: `${randomInt(1, 20)}kg`,
      remark: '',
    };

    if (i <= invalidSkuRows) {
      row.skuCode = `SKU_${String(90_000 + i).padStart(5, '0')}`;
    } else if (i <= invalidSkuRows + badPhoneRows) {
      row.receiverPhone = '123';
    } else if (i <= invalidSkuRows + badPhoneRows + badQuantityRows) {
      row.skuQuantity = -5;
    } else if (i <= invalidSkuRows + badPhoneRows + badQuantityRows + duplicateOrderRows) {
      row.externalCode = 'ORDER_00001';
    }

    sheet.addRow(row);
  }

  const dir = path.resolve(process.cwd(), 'test-data');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, '10000-orders.xlsx');
  await workbook.xlsx.writeFile(filePath);

  return {
    filePath,
    rows,
    skuCount: skus.length,
    invalidSkuRows,
    badPhoneRows,
    badQuantityRows,
    duplicateOrderRows,
  };
}
