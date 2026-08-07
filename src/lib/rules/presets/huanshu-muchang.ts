/**
 * 规则预设：欢乐牧场模板0430
 * 模式：table（无标准表头，使用列索引映射）
 * 特点：仓库库存报表，首行为表头，数据从第二行开始
 */
import type { ParseRule } from '../types';

export const huanshuMuchangRule: ParseRule = {
  id: 'preset-huanshu-muchang',
  name: '欢乐牧场库存报表',
  description: '欢乐牧场仓库库存报表，含SKU名称、编码、规格、在库数量等',
  fileType: 'excel',

  source: {
    type: 'table',
    sheetConfig: { sheetIndex: 0 },
  },

  dataRegion: {
    headerRow: 1,
    dataStartRow: 2,
    dataEndRow: 'auto',
  },

  fieldMapping: {
    storeName: { type: 'column', column: '货主名称' },
    skuName: { type: 'column', column: 'SKU名称' },
    skuCode: { type: 'column', column: '外部商品编码' },
    skuSpec: { type: 'column', column: '规格' },
    skuQuantity: { type: 'column', column: '在库数量的总和' },
  },

  postProcessing: {
    trimWhitespace: true,
    removeEmptyRows: true,
  },
};
