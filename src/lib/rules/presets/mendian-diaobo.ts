/**
 * 规则预设：门店调拨单-卡片式
 * 模式：card
 * 特点：以"▶ 调拨记录 #N"为卡片起始标志，每张卡片包含收货信息和内嵌物品表格
 */
import type { ParseRule } from '../types';

export const mendianDiaoboRule: ParseRule = {
  id: 'preset-mendian-diaobo',
  name: '门店调拨单（卡片式）',
  description: '武汉配送中心门店调拨单，每条调拨记录为一个卡片，含收货人和物品明细',
  fileType: 'excel',

  source: {
    type: 'card',
    sheetConfig: { sheetIndex: 0 },
  },

  cardParsing: {
    cardStartPattern: '▶\\s*调拨记录',
    metadataPatterns: {
      storeName: '调入门店\\s+(.+?)(?:\\s+收货人|$)',
      receiverName: '收货人\\s+(.+?)(?:\\s+电话|$)',
      receiverPhone: '电话\\s+(\\S+)',
      receiverAddress: '收货地址\\s+(.+)',
    },
    innerTableConfig: {
      headerOffset: 3,
      dataStartOffset: 4,
      fieldMapping: {
        skuCode: { type: 'column', column: '物品编码' },
        skuName: { type: 'column', column: '物品名称' },
        skuSpec: { type: 'column', column: '规格' },
        skuQuantity: { type: 'column', column: '数量' },
      },
    },
  },

  metadataExtraction: [
    {
      targetField: 'externalCode',
      searchArea: 'specific-row',
      row: 2,
      searchPattern: '调拨单号',
      regex: '调拨单号[：:]\\s*(\\S+)',
    },
  ],

  postProcessing: {
    trimWhitespace: true,
    removeEmptyRows: true,
  },
};
