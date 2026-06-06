import { RuleEngine } from '@/lib/rules/engine';
import type { ParseRule, RawFileData } from '@/lib/rules/types';

// POST: 接收规则配置 + 文件原始数据 → 调用RuleEngine解析 → 返回结果
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ruleConfig, rawData } = body as {
      ruleConfig?: ParseRule;
      rawData?: RawFileData;
    };

    if (!ruleConfig || !rawData) {
      return Response.json(
        { error: '缺少必要参数: ruleConfig 和 rawData' },
        { status: 400 }
      );
    }

    const engine = new RuleEngine();
    const result = engine.parse(rawData, ruleConfig);

    return Response.json(result);
  } catch (error) {
    console.error('Parse error:', error);
    return Response.json(
      {
        success: false,
        data: [],
        errors: [`解析失败: ${error instanceof Error ? error.message : '未知错误'}`],
        totalRows: 0,
        parsedRows: 0,
      },
      { status: 500 }
    );
  }
}
