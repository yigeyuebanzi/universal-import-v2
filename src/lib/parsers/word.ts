/**
 * Word(.docx)解析器
 * 将 .docx 文件解析为纯文本
 */
import mammoth from 'mammoth';
import type { RawFileData } from './types';

/**
 * 从ArrayBuffer解析Word文件
 * @param buffer - 文件的ArrayBuffer
 * @returns RawFileData (text字段)
 */
export async function parseWord(buffer: ArrayBuffer): Promise<RawFileData> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return { type: 'word', text: result.value };
}
