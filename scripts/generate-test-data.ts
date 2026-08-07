import { generateTestExcel } from './lib/generate-test-excel';

generateTestExcel()
  .then((r) => {
    console.log(`[generate-test-data] 已生成 ${r.filePath}，数据行 ${r.rows}，SKU 主数据 ${r.skuCount}`);
    console.log(
      `  故意错误：非法SKU ${r.invalidSkuRows} 行，坏手机号 ${r.badPhoneRows} 行，负数量 ${r.badQuantityRows} 行，重复单号 ${r.duplicateOrderRows} 行`
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error('[generate-test-data] 失败', err);
    process.exit(1);
  });
