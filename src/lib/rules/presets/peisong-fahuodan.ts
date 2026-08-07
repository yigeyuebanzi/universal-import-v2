/**
 * 规则预设：12.25海口龙湖天街-配送发货单
 * 模式：table + metadataExtraction
 * 特点：表头+数据区在中间，收货人信息散落在数据区下方的非标准位置
 */
import type { ParseRule } from '../types';

export const peisongFahuodanRule: ParseRule = {
  id: 'preset-peisong-fahuodan',
  name: '配送发货单（龙湖天街格式）',
  description: '黎明屯铁锅炖配送中心-配送发货单，含散落的收货人信息和明细表格',
  fileType: 'excel',

  source: {
    type: 'table',
    sheetConfig: { sheetIndex: 0 },
  },

  dataRegion: {
    headerRow: 4,
    dataStartRow: 5,
    dataEndRow: 'auto',
    skipPatterns: ['合计'],
  },

  fieldMapping: {
    skuCode: { type: 'column', column: '物品编码' },
    skuName: { type: 'column', column: '物品名称' },
    skuSpec: { type: 'column', column: '规格型号' },
    skuQuantity: { type: 'column', column: '发货数量' },
  },

  metadataExtraction: [
    {
      targetField: 'externalCode',
      searchArea: 'specific-row',
      row: 8,
      searchPattern: '单据号',
      regex: '单据号\\s+(\\S+)',
    },
    {
      targetField: 'storeName',
      searchArea: 'specific-row',
      row: 2,
      searchPattern: '收货机构',
      regex: '收货机构\\s+(.+?)\\s+供货机构',
    },
    {
      targetField: 'receiverName',
      searchArea: 'specific-row',
      row: 9,
      searchPattern: '收货人',
      regex: '收货人\\s+(.+?)\\s+收货电话',
    },
    {
      targetField: 'receiverPhone',
      searchArea: 'specific-row',
      row: 9,
      searchPattern: '收货电话',
      regex: '收货电话\\s+(\\S+)',
    },
    {
      targetField: 'receiverAddress',
      searchArea: 'specific-row',
      row: 9,
      searchPattern: '收货地址',
      regex: '收货地址\\s+(.+)',
    },
  ],

  postProcessing: {
    trimWhitespace: true,
    removeEmptyRows: true,
  },
};
