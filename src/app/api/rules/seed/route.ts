import { db } from '@/lib/db';
import { parseRules } from '@/lib/db/schema';
import { presetRules } from '@/lib/rules/presets';
import { eq } from 'drizzle-orm';

/**
 * POST /api/rules/seed
 * 将预设规则批量写入数据库
 * 支持幂等操作：已存在的规则（按id匹配）会被更新，新规则会被插入
 */
export async function POST() {
  try {
    const results = [];

    for (const rule of presetRules) {
      // 检查规则是否已存在（用name作为唯一性判断）
      const existing = await db
        .select()
        .from(parseRules)
        .where(eq(parseRules.name, rule.name))
        .limit(1);

      const ruleConfig = { ...rule };
      // 移除id字段，让数据库自动生成
      delete (ruleConfig as Record<string, unknown>).id;

      if (existing.length > 0) {
        // 更新已有规则
        const updated = await db
          .update(parseRules)
          .set({
            description: rule.description || null,
            fileType: rule.fileType,
            ruleConfig,
            updatedAt: new Date(),
          })
          .where(eq(parseRules.id, existing[0].id))
          .returning();
        results.push({ action: 'updated', id: updated[0]?.id, name: rule.name });
      } else {
        // 插入新规则
        const inserted = await db
          .insert(parseRules)
          .values({
            name: rule.name,
            description: rule.description || null,
            fileType: rule.fileType,
            ruleConfig,
          })
          .returning();
        results.push({ action: 'inserted', id: inserted[0]?.id, name: rule.name });
      }
    }

    return Response.json({
      success: true,
      message: `成功处理 ${results.length} 条预设规则`,
      details: results,
    });
  } catch (error) {
    console.error('Seed rules failed:', error);
    return Response.json(
      { error: '批量写入规则失败', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
