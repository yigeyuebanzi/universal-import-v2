import { NextRequest, NextResponse } from 'next/server';
import { generateRuleWithAI, AIGenerateOptions } from '@/lib/ai/generate-rule';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { fileContent, fileType, sheetNames, totalRows, sampleData } = body as {
      fileContent?: string;
      fileType?: string;
      sheetNames?: string[];
      totalRows?: number;
      sampleData?: string[][];
    };

    // 参数验证
    if (!fileContent || typeof fileContent !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少必要参数: fileContent' },
        { status: 400 }
      );
    }

    if (!fileType || !['excel', 'word', 'pdf'].includes(fileType)) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数: fileType (可选值: excel, word, pdf)' },
        { status: 400 }
      );
    }

    const options: AIGenerateOptions = {
      fileContent,
      fileType: fileType as 'excel' | 'word' | 'pdf',
      sheetNames,
      totalRows,
      sampleData,
    };

    const result = await generateRuleWithAI(options);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `请求处理失败: ${error instanceof Error ? error.message : '未知错误'}`,
      },
      { status: 500 }
    );
  }
}
