import { db } from '@/lib/db';
import { parseRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// GET: 查询单条规则
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await db.select().from(parseRules).where(eq(parseRules.id, id));

    if (!result.length) {
      return Response.json({ error: '规则不存在' }, { status: 404 });
    }

    return Response.json(result[0]);
  } catch (error) {
    console.error('Failed to fetch rule:', error);
    return Response.json({ error: '获取规则失败' }, { status: 500 });
  }
}

// PUT: 更新规则
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.fileType !== undefined) updateData.fileType = body.fileType;
    if (body.ruleConfig !== undefined) updateData.ruleConfig = body.ruleConfig;
    updateData.updatedAt = new Date();

    const result = await db
      .update(parseRules)
      .set(updateData)
      .where(eq(parseRules.id, id))
      .returning();

    if (!result.length) {
      return Response.json({ error: '规则不存在' }, { status: 404 });
    }

    return Response.json(result[0]);
  } catch (error) {
    console.error('Failed to update rule:', error);
    return Response.json({ error: '更新规则失败' }, { status: 500 });
  }
}

// DELETE: 删除规则
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await db
      .delete(parseRules)
      .where(eq(parseRules.id, id))
      .returning();

    if (!result.length) {
      return Response.json({ error: '规则不存在' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Failed to delete rule:', error);
    return Response.json({ error: '删除规则失败' }, { status: 500 });
  }
}
