/**
 * 规则预设：门店配送确认单（Word格式）
 * 模式：text
 * 特点：纯文本格式，以━━━分隔多条配送记录，每条记录含收货信息和物品明细
 */
import type { ParseRule } from '../types';

export const mendianPeisongQueRenRule: ParseRule = {
  id: 'preset-mendian-peisong-queren',
  name: '门店配送确认单（Word格式）',
  description: 'Word文档格式的配送确认单，多条记录以分隔线区分，含配送信息和物品明细',
  fileType: 'word',

  source: {
    type: 'text',
  },

  textParsing: {
    recordSeparator: '━{10,}',
    fieldPatterns: {
      externalCode: '配送单号[：:]?\\s*(\\S+)',
      storeName: '收货门店[：:]?\\s*(.+)',
      receiverName: '收货人[：:]?\\s*(.+)',
      receiverPhone: '联系电话[：:]?\\s*(\\S+)',
      receiverAddress: '收货地址[：:]?\\s*(.+)',
    },
    itemPattern: '\\d+\\.\\s+(\\S+)\\s*\\|\\s*(.+?)\\s*\\|\\s*(.+?)\\s*\\|\\s*(\\d+)',
    itemFields: ['skuCode', 'skuName', 'skuSpec', 'skuQuantity'],
  },

  postProcessing: {
    trimWhitespace: true,
    removeEmptyRows: true,
  },
};
