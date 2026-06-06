import { ParseRule } from '../rules/types';

// ========== 类型定义 ==========

export interface AIGenerateOptions {
  fileContent: string;         // 文件前20行内容预览
  fileType: 'excel' | 'word' | 'pdf';
  sheetNames?: string[];       // Excel的Sheet名称列表
  totalRows?: number;          // 总行数
  sampleData?: string[][];     // 前几行原始数据
}

export interface AIGenerateResult {
  success: boolean;
  rule?: Partial<ParseRule>;
  confidence?: Record<string, number>; // 每个字段的置信度(0-1)
  explanation?: string;        // AI对文件结构的分析说明
  error?: string;
}

// ========== System Prompt ==========

const SYSTEM_PROMPT = `你是一个专业的文件结构分析助手。你的任务是分析用户提供的文件内容样本，并生成一个JSON格式的解析规则。

## 解析规则Schema说明

一个解析规则描述"如何从文件中提取结构化的出库单数据"。目标字段包括：
- externalCode: 外部编码/配送单号
- storeName: 收货门店名称
- receiverName: 收件人姓名
- receiverPhone: 收件人电话
- receiverAddress: 收件人地址
- skuCode: SKU物品编码
- skuName: SKU物品名称
- skuQuantity: SKU发货数量
- skuSpec: SKU规格型号
- remark: 备注

## 规则JSON结构

{
  "name": "规则名称",
  "description": "规则描述",
  "fileType": "excel|word|pdf",
  "source": {
    "type": "table|text|matrix|card|multi-sheet",
    "sheetConfig": { "sheetIndex": 0, "allSheets": false }
  },
  "dataRegion": {
    "headerRow": 数字(1-based),
    "dataStartRow": 数字(1-based),
    "dataEndRow": 数字或"auto",
    "skipPatterns": ["合计", "总计"]
  },
  "fieldMapping": {
    "字段名": {
      "type": "column|cell|regex|static",
      "column": 列索引(0-based)或列名字符串,
      "cell": "A1格式",
      "regex": "正则表达式",
      "regexGroup": 1,
      "staticValue": "静态值"
    }
  },
  "aggregation": { "groupBy": "字段名", "sharedFields": ["字段名"] },
  "matrixTranspose": { ... },
  "cardParsing": { ... },
  "textParsing": { ... },
  "cellSplitting": { ... },
  "metadataExtraction": [...],
  "postProcessing": { "trimWhitespace": true, "removeEmptyRows": true, "skipPatterns": ["合计"] }
}

## source.type说明：
- "table": 标准表格(最常见)，有表头行+数据行
- "matrix": 矩阵转置，列头是动态值(如门店名/日期)，需要转置为独立记录
- "card": 卡片式，多个独立区块纵向堆叠，每块是一条记录
- "text": 纯文本(Word/PDF)，用分隔符和正则提取
- "multi-sheet": 多Sheet合并，每个Sheet独立解析后合并

## 示例规则1（标准表格+尾部信息）：
{
  "name": "配送发货单规则",
  "fileType": "excel",
  "source": { "type": "table" },
  "dataRegion": { "headerRow": 4, "dataStartRow": 5, "dataEndRow": "auto", "skipPatterns": ["合计"] },
  "fieldMapping": {
    "skuCode": { "type": "column", "column": "物品编码" },
    "skuName": { "type": "column", "column": "物品名称" },
    "skuQuantity": { "type": "column", "column": "发货数量" }
  },
  "metadataExtraction": [
    { "targetField": "receiverName", "searchArea": "footer", "searchPattern": "收货人", "regex": "收货人[：:]\\\\s*(.+)" },
    { "targetField": "receiverPhone", "searchArea": "footer", "searchPattern": "电话", "regex": "电话[：:]\\\\s*(.+)" }
  ],
  "postProcessing": { "trimWhitespace": true, "removeEmptyRows": true }
}

## 示例规则2（跨行聚合）：
{
  "name": "发货明细聚合规则",
  "fileType": "excel",
  "source": { "type": "table" },
  "dataRegion": { "headerRow": 2, "dataStartRow": 3, "dataEndRow": "auto" },
  "fieldMapping": {
    "externalCode": { "type": "column", "column": "配送单号" },
    "storeName": { "type": "column", "column": "收货门店" },
    "receiverName": { "type": "column", "column": "收货人" },
    "receiverPhone": { "type": "column", "column": "联系电话" },
    "receiverAddress": { "type": "column", "column": "收货地址" },
    "skuCode": { "type": "column", "column": "物品编码" },
    "skuName": { "type": "column", "column": "物品名称" },
    "skuQuantity": { "type": "column", "column": "数量" }
  },
  "aggregation": { "groupBy": "externalCode", "sharedFields": ["storeName","receiverName","receiverPhone","receiverAddress"] },
  "postProcessing": { "trimWhitespace": true, "removeEmptyRows": true }
}

## 你的任务：
1. 分析用户提供的文件内容样本
2. 判断文件结构类型(table/matrix/card/text/multi-sheet)
3. 识别表头位置、数据区域、字段对应关系
4. 生成完整的解析规则JSON
5. 对每个字段映射给出confidence(0-1)表示你的确信程度

请只返回JSON，格式为：
{
  "rule": { ...完整规则JSON... },
  "confidence": { "字段名": 0.9, ... },
  "explanation": "你对文件结构的分析说明"
}`;

// ========== 核心函数 ==========

/**
 * 构建用户提示词
 */
function buildUserPrompt(options: AIGenerateOptions): string {
  const { fileContent, fileType, sheetNames, totalRows, sampleData } = options;

  let prompt = `文件类型: ${fileType}`;

  if (sheetNames && sheetNames.length > 0) {
    prompt += `\nSheet名称: ${sheetNames.join(', ')}`;
  }

  if (totalRows !== undefined) {
    prompt += `\n总行数: ${totalRows}`;
  }

  prompt += `\n\n文件内容前20行:\n${fileContent}`;

  if (sampleData && sampleData.length > 0) {
    prompt += `\n\n原始数据样本(JSON格式):\n${JSON.stringify(sampleData, null, 2)}`;
  }

  prompt += '\n\n请分析此文件的结构并生成解析规则。';

  return prompt;
}

/**
 * 从AI响应文本中提取JSON
 * 尝试多种方式解析，确保鲁棒性
 */
function extractJSON(text: string): unknown {
  // 方式1: 直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 继续尝试其他方式
  }

  // 方式2: 提取 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // 继续尝试
    }
  }

  // 方式3: 查找第一个 { 到最后一个 } 之间的内容
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // 解析失败
    }
  }

  throw new Error('无法从AI响应中提取有效的JSON');
}

/**
 * 验证并规范化AI生成的规则
 */
function validateAndNormalizeRule(raw: Record<string, unknown>): {
  rule: Partial<ParseRule>;
  confidence: Record<string, number>;
  explanation: string;
} {
  // 兼容两种AI返回格式:
  // 1. { rule: {...}, confidence: {...}, explanation: "..." }
  // 2. 规则字段直接在顶层（如 { source: {...}, fieldMapping: {...}, confidence: {...}, ... }）
  let rawRule: Record<string, unknown>;
  let confidence: Record<string, number>;
  let explanation: string;

  if (raw.rule && typeof raw.rule === 'object') {
    // 标准格式: rule嵌套在"rule"键下
    rawRule = raw.rule as Record<string, unknown>;
    confidence = (raw.confidence ?? {}) as Record<string, number>;
    explanation = (raw.explanation ?? '') as string;
  } else if (raw.source || raw.fieldMapping || raw.dataRegion) {
    // 兼容格式: AI直接返回了规则字段在顶层
    rawRule = raw;
    confidence = (raw.confidence ?? {}) as Record<string, number>;
    explanation = (raw.explanation ?? '') as string;
  } else {
    rawRule = {};
    confidence = (raw.confidence ?? {}) as Record<string, number>;
    explanation = (raw.explanation ?? '') as string;
  }

  // 基本字段验证
  const rule: Partial<ParseRule> = {
    name: (rawRule.name as string) || 'AI生成的规则',
    description: rawRule.description as string | undefined,
    fileType: rawRule.fileType as 'excel' | 'word' | 'pdf' | undefined,
  };

  // source
  if (rawRule.source && typeof rawRule.source === 'object') {
    rule.source = rawRule.source as ParseRule['source'];
  }

  // dataRegion
  if (rawRule.dataRegion && typeof rawRule.dataRegion === 'object') {
    rule.dataRegion = rawRule.dataRegion as ParseRule['dataRegion'];
  }

  // fieldMapping
  if (rawRule.fieldMapping && typeof rawRule.fieldMapping === 'object') {
    rule.fieldMapping = rawRule.fieldMapping as ParseRule['fieldMapping'];
  }

  // aggregation
  if (rawRule.aggregation && typeof rawRule.aggregation === 'object') {
    rule.aggregation = rawRule.aggregation as ParseRule['aggregation'];
  }

  // matrixTranspose
  if (rawRule.matrixTranspose && typeof rawRule.matrixTranspose === 'object') {
    rule.matrixTranspose = rawRule.matrixTranspose as ParseRule['matrixTranspose'];
  }

  // cardParsing
  if (rawRule.cardParsing && typeof rawRule.cardParsing === 'object') {
    rule.cardParsing = rawRule.cardParsing as ParseRule['cardParsing'];
  }

  // textParsing
  if (rawRule.textParsing && typeof rawRule.textParsing === 'object') {
    rule.textParsing = rawRule.textParsing as ParseRule['textParsing'];
  }

  // cellSplitting
  if (rawRule.cellSplitting && typeof rawRule.cellSplitting === 'object') {
    rule.cellSplitting = rawRule.cellSplitting as ParseRule['cellSplitting'];
  }

  // metadataExtraction
  if (rawRule.metadataExtraction && Array.isArray(rawRule.metadataExtraction)) {
    rule.metadataExtraction = rawRule.metadataExtraction as ParseRule['metadataExtraction'];
  }

  // postProcessing
  if (rawRule.postProcessing && typeof rawRule.postProcessing === 'object') {
    rule.postProcessing = rawRule.postProcessing as ParseRule['postProcessing'];
  }

  // 确保 source 字段始终存在（防御性默认值）
  if (!rule.source) {
    // 根据已有配置推断 source type
    if (rule.matrixTranspose) {
      rule.source = { type: 'matrix' };
    } else if (rule.cardParsing) {
      rule.source = { type: 'card' };
    } else if (rule.textParsing) {
      rule.source = { type: 'text' };
    } else {
      // 默认使用 table 模式（最常见）
      rule.source = { type: 'table' };
    }
  }

  return { rule, confidence, explanation };
}

/**
 * 调用DeepSeek API生成解析规则
 */
export async function generateRuleWithAI(options: AIGenerateOptions): Promise<AIGenerateResult> {
  const baseUrl = process.env.DEEPSEEK_BASE_URL;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return {
      success: false,
      error: 'DeepSeek API配置缺失，请检查环境变量 DEEPSEEK_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL',
    };
  }

  const userPrompt = buildUserPrompt(options);

  // 30秒超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '未知错误');
      return {
        success: false,
        error: `DeepSeek API调用失败 (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();

    // 提取AI回复内容
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return {
        success: false,
        error: 'AI返回内容为空',
      };
    }

    // 解析JSON
    let parsed: unknown;
    try {
      parsed = extractJSON(content);
    } catch (parseError) {
      return {
        success: false,
        error: `AI响应JSON解析失败: ${parseError instanceof Error ? parseError.message : '未知错误'}`,
      };
    }

    // 验证并规范化
    const { rule, confidence, explanation } = validateAndNormalizeRule(
      parsed as Record<string, unknown>
    );

    return {
      success: true,
      rule,
      confidence,
      explanation,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        success: false,
        error: 'AI调用超时(30秒)，请稍后重试',
      };
    }
    return {
      success: false,
      error: `AI调用异常: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
