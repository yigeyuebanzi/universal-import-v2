/**
 * PDF解析器（服务端使用）
 * 将 .pdf 文件解析为文本
 * 注意：pdf-parse 只能在服务端 API Route 中使用
 */
import type { RawFileData } from './types';

/**
 * 从Buffer解析PDF文件
 * @param buffer - 文件的Buffer
 * @returns RawFileData (text和pages字段)
 */
export async function parsePdf(buffer: Buffer): Promise<RawFileData> {
  // 动态导入 pdf-parse，避免在客户端被打包
  const { PDFParse } = await import('pdf-parse');

  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const textResult = await parser.getText();

    // textResult.pages 是按页分割的文本数组，每项包含 num 和 text
    const pages = textResult.pages.map((page) => page.text);

    return {
      type: 'pdf',
      text: textResult.text,
      pages,
    };
  } finally {
    await parser.destroy();
  }
}
