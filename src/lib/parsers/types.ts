/**
 * 通用数据类型 - 所有解析器的统一输出格式
 */
export interface RawFileData {
  type: 'excel' | 'word' | 'pdf';
  sheets?: RawSheet[];
  text?: string;
  pages?: string[];
}

export interface RawSheet {
  name: string;
  data: (string | number | null | undefined)[][];
}
