/**
 * 规则预设：湖南仓发货明细
 * 模式：table + aggregation
 * 特点：同一配送汇总单号下多条SKU行，需按单号聚合收货人信息
 */
import type { ParseRule } from '../types';

export const hunanCangRule: ParseRule = {
  id: 'preset-hunan-cang',
  name: '湖南仓发货明细',
  description: '湖南仓库汇总单发货明细，同一单号下多行SKU，收货人信息在每行中重复',
  fileType: 'excel',

  source: {
    type: 'table',
    sheetConfig: { sheetIndex: 0 },
  },

  dataRegion: {
    headerRow: 2,
    dataStartRow: 3,
    dataEndRow: 'auto',
    skipRows: [1],
  },

  fieldMapping: {
    externalCode: { type: 'column', column: '配送汇总单号*' },
    storeName: { type: 'column', column: '收货机构' },
    skuCode: { type: 'column', column: '物品编码*' },
    skuName: { type: 'column', column: '物品名称' },
    skuSpec: { type: 'column', column: '规格型号' },
    skuQuantity: { type: 'column', column: '发货数量*' },
    receiverName: { type: 'column', column: '收货人' },
    receiverPhone: { type: 'column', column: '收货电话' },
    receiverAddress: { type: 'column', column: '收货地址' },
    remark: { type: 'column', column: '单据备注' },
  },

  aggregation: {
    groupBy: 'externalCode',
    sharedFields: ['storeName', 'receiverName', 'receiverPhone', 'receiverAddress'],
  },

  postProcessing: {
    trimWhitespace: true,
    removeEmptyRows: true,
  },
};
