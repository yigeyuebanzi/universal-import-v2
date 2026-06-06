/**
 * 规则预设：多门店分Sheet出库单
 * 模式：multi-sheet + metadataExtraction
 * 特点：每个Sheet对应一个门店，表格格式统一，收货信息在数据区下方
 */
import type { ParseRule } from '../types';

export const duoMendianChukuRule: ParseRule = {
  id: 'preset-duo-mendian-chuku',
  name: '多门店分Sheet出库单',
  description: '每个Sheet一个门店的出库单，含物品明细和底部收货信息',
  fileType: 'excel',

  source: {
    type: 'multi-sheet',
    sheetConfig: { allSheets: true },
  },

  dataRegion: {
    headerRow: 4,
    dataStartRow: 5,
    dataEndRow: 12,
    skipPatterns: ['合计'],
  },

  fieldMapping: {
    skuCode: { type: 'column', column: '物品编码' },
    skuName: { type: 'column', column: '物品名称' },
    skuSpec: { type: 'column', column: '规格型号' },
    skuQuantity: { type: 'column', column: '出库数量' },
    remark: { type: 'column', column: '备注' },
  },

  metadataExtraction: [
    {
      targetField: 'storeName',
      searchArea: 'specific-row',
      row: 1,
      column: 0,
      regex: '^(.+?)出库单',
    },
    {
      targetField: 'receiverName',
      searchArea: 'specific-row',
      row: 14,
      searchPattern: '联系人',
      regex: '联系人[：:]\\s*(.+)',
    },
    {
      targetField: 'receiverPhone',
      searchArea: 'specific-row',
      row: 15,
      searchPattern: '联系电话',
      regex: '联系电话[：:]\\s*(\\S+)',
    },
    {
      targetField: 'receiverAddress',
      searchArea: 'specific-row',
      row: 15,
      searchPattern: '收货地址',
      regex: '收货地址[：:]\\s*(.+)',
    },
  ],

  postProcessing: {
    trimWhitespace: true,
    removeEmptyRows: true,
  },
};
