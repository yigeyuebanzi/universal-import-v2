import { db } from '@/lib/db';
import { parseRules } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

// GET: 查询所有规则
export async function GET() {
  try {
    const rules = await db.select().from(parseRules).orderBy(desc(parseRules.createdAt));
    return Response.json({ success: true, data: rules });
  } catch (error) {
    console.error('Failed to fetch rules:', error);
    return Response.json({ success: false, error: '获取规则列表失败' }, { status: 500 });
  }
}

// POST: 创建新规则
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.name || !body.fileType) {
      return Response.json({ success: false, error: '规则名称和文件类型为必填项' }, { status: 400 });
    }

    const result = await db.insert(parseRules).values({
      name: body.name,
      description: body.description || null,
      fileType: body.fileType,
      ruleConfig: body.ruleConfig || {},
    }).returning();

    return Response.json({ success: true, data: result[0] }, { status: 201 });
  } catch (error) {
    console.error('Failed to create rule:', error);
    return Response.json({ success: false, error: '创建规则失败' }, { status: 500 });
  }
}
