/**
 * 规则预设加载器
 * 导出所有9份demo文件的预设规则配置
 */
import type { ParseRule } from '../types';
import { peisongFahuodanRule } from './peisong-fahuodan';
import { zhouPeisongJihuaRule } from './zhou-peisong-jihua';
import { duoMendianChukuRule } from './duo-mendian-chuku';
import { huanshuMuchangRule } from './huanshu-muchang';
import { hunanCangRule } from './hunan-cang';
import { mendianDiaoboRule } from './mendian-diaobo';
import { mendianPeisongQueRenRule } from './mendian-peisong-queren';
import { peisongQianshouRule } from './peisong-qianshou';
import { qianZhaiZhaiRule } from './qian-zhaizhai';

/** 所有预设规则 */
export const presetRules: ParseRule[] = [
  peisongFahuodanRule,       // 1. 配送发货单 (table + metadataExtraction)
  zhouPeisongJihuaRule,      // 2. 周配送计划 (matrix + cellSplitting)
  duoMendianChukuRule,       // 3. 多门店分Sheet出库单 (multi-sheet)
  huanshuMuchangRule,        // 4. 欢乐牧场库存报表 (table)
  hunanCangRule,             // 5. 湖南仓发货明细 (table + aggregation)
  mendianDiaoboRule,         // 6. 门店调拨单-卡片式 (card)
  mendianPeisongQueRenRule,  // 7. 门店配送确认单 (text - Word)
  peisongQianshouRule,       // 8. 配送签收单-多单 (text - PDF)
  qianZhaiZhaiRule,          // 9. 黔寨寨配送单 (text - PDF)
];

/**
 * 根据文件名匹配预设规则
 * 优先按文件名特征匹配，未匹配到返回 undefined
 */
export function matchPresetRule(fileName: string): ParseRule | undefined {
  // 去除路径和扩展名，获取纯文件名用于匹配
  const baseName = fileName.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '');

  for (const rule of presetRules) {
    if (isRuleMatch(rule, fileName, baseName)) {
      return rule;
    }
  }
  return undefined;
}

/**
 * 判断规则是否匹配文件
 */
function isRuleMatch(rule: ParseRule, fileName: string, baseName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase();

  // 先检查文件类型
  if (rule.fileType === 'excel' && ext !== 'xlsx' && ext !== 'xls') return false;
  if (rule.fileType === 'word' && ext !== 'docx' && ext !== 'doc') return false;
  if (rule.fileType === 'pdf' && ext !== 'pdf') return false;

  // 按规则ID匹配文件名关键词
  const matchMap: Record<string, string[]> = {
    'preset-peisong-fahuodan': ['配送发货单', '龙湖天街'],
    'preset-zhou-peisong-jihua': ['周配送计划'],
    'preset-duo-mendian-chuku': ['多门店', '分Sheet', '出库单'],
    'preset-huanshu-muchang': ['欢乐牧场'],
    'preset-hunan-cang': ['湖南仓'],
    'preset-mendian-diaobo': ['调拨单', '卡片式'],
    'preset-mendian-peisong-queren': ['配送确认单'],
    'preset-peisong-qianshou': ['签收单', '多单'],
    'preset-qian-zhaizhai': ['黔寨寨', '烙锅'],
  };

  const keywords = matchMap[rule.id];
  if (!keywords) return false;

  // 所有关键词都在文件名中出现则匹配
  return keywords.every(kw => baseName.includes(kw) || fileName.includes(kw));
}

/**
 * 获取规则ID到规则对象的映射
 */
export function getPresetRuleMap(): Map<string, ParseRule> {
  const map = new Map<string, ParseRule>();
  for (const rule of presetRules) {
    map.set(rule.id, rule);
  }
  return map;
}
