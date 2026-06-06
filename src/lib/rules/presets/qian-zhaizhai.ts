/**
 * 规则预设：黔寨寨贵州烙锅（鞍山店）配送单（PDF格式）
 * 模式：text
 * 特点：单条配送单的PDF，顶部含单据编号/收货机构/收货人等信息，
 *       下方为物品列表（序号+类别+编码+名称+规格+单位+数量）
 */
import type { ParseRule } from '../types';

export const qianZhaiZhaiRule: ParseRule = {
  id: 'preset-qian-zhaizhai',
  name: '黔寨寨配送单（PDF格式）',
  description: '黔寨寨贵州烙锅配送单PDF，含头部元信息和物品列表',
  fileType: 'pdf',

  source: {
    type: 'text',
  },

  textParsing: {
    recordSeparator: '(?=NEVERMATCH_9999)',
    fieldPatterns: {
      externalCode: '单据编号[：:]\\s*(\\S+)',
      storeName: '收货机构[：:]\\s*(.+?)(?:\\s+订货机构|$)',
      receiverName: '收货人[：:]\\s*(.+?)\\s',
      receiverPhone: '收货电话[：:]\\s*(\\S+)',
      receiverAddress: '收货地址[：:]\\s*(.+)',
    },
    itemPattern: '(ZBWP\\d+)\\s+(.+?)\\s+(\\d[\\d.a-zA-Z*\\/\\u5305\\u888B\\u4EF6\\u676F\\u6876]*.*?)\\s+(件|包|瓶|桶)\\s+(\\d+)',
    itemFields: ['skuCode', 'skuName', 'skuSpec', '_unit', 'skuQuantity'],
  },

  postProcessing: {
    trimWhitespace: true,
    removeEmptyRows: true,
    defaultValues: {
      skuQuantity: '0',
    },
  },
};
