/**
 * 规则预设：周配送计划
 * 模式：matrix + cellSplitting
 * 特点：门店在行，配送日/星期在列，单元格内含"品名x数量"多行文本
 */
import type { ParseRule } from '../types';

export const zhouPeisongJihuaRule: ParseRule = {
  id: 'preset-zhou-peisong-jihua',
  name: '周配送计划（矩阵格式）',
  description: '盛鼎食材公司周配送计划，门店×星期的矩阵，单元格内含SKU×数量',
  fileType: 'excel',

  source: {
    type: 'matrix',
    sheetConfig: { sheetIndex: 0 },
  },

  dataRegion: {
    headerRow: 2,
    dataStartRow: 3,
    dataEndRow: 'auto',
  },

  matrixTranspose: {
    fixedColumns: [0],
    transposeStartCol: 1,
    transposeHeaderRow: 2,
    valueField: 'skuName',
    headerField: 'remark',
    skipEmptyValues: true,
  },

  fieldMapping: {
    storeName: { type: 'column', column: 0 },
  },

  cellSplitting: {
    targetField: 'skuName',
    splitPattern: '\\n',
    extractPattern: '(.+?)[xX×](\\d+)',
    extractFields: ['skuName', 'skuQuantity'],
  },

  postProcessing: {
    trimWhitespace: true,
    removeEmptyRows: true,
  },
};
