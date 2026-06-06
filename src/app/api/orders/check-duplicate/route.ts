import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { codes }: { codes: string[] } = body;

    if (!codes || !Array.isArray(codes)) {
      return NextResponse.json(
        { error: 'codes must be a string array' },
        { status: 400 }
      );
    }

    // TODO: 实际查询数据库检查重复
    // const existing = await db.select({ externalCode: orders.externalCode })
    //   .from(orders)
    //   .where(inArray(orders.externalCode, codes));
    // const duplicateCodes = existing.map(r => r.externalCode);

    const duplicateCodes: string[] = [];
    return NextResponse.json({ duplicateCodes });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
