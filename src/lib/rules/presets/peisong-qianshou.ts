/**
 * 规则预设：配送签收单-多单（PDF格式）
 * 模式：text
 * 特点：PDF文本提取，以"配送签收单 #N"分隔多条记录，含签收信息和物品明细
 */
import type { ParseRule } from '../types';

export const peisongQianshouRule: ParseRule = {
  id: 'preset-peisong-qianshou',
  name: '配送签收单（PDF多单格式）',
  description: 'PDF格式配送签收单，多条签收记录以"配送签收单 #N"分隔',
  fileType: 'pdf',

  source: {
    type: 'text',
  },

  textParsing: {
    recordSeparator: '配送签收单\\s*#\\d+',
    fieldPatterns: {
      externalCode: '配送单号[：:]?\\s*(\\S+)',
      storeName: '收货门店[：:]?\\s*(.+)',
      receiverName: '收货人[：:]?\\s*(.+)',
      receiverPhone: '联系电话[：:]?\\s*(\\d[\\d\\s]+)',
      receiverAddress: '收货地址[：:]?\\s*(.+)',
    },
    itemPattern: '(SKU\\d+)\\s+(.+?)\\s+(盒装|袋装|件|包|箱)\\s+(\\d+)',
    itemFields: ['skuCode', 'skuName', 'skuSpec', 'skuQuantity'],
  },

  postProcessing: {
    trimWhitespace: true,
    removeEmptyRows: true,
  },
};
