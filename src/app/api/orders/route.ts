import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orders, orderItems, importBatches } from '@/lib/db/schema';
import { eq, like, gte, lte, and, sql, desc } from 'drizzle-orm';

/** 批量插入的每批大小 */
const BATCH_SIZE = 100;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') || '10')));
    const externalCode = searchParams.get('externalCode') || '';
    const receiverName = searchParams.get('receiverName') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    // Build conditions
    const conditions = [];
    if (externalCode) {
      conditions.push(like(orders.externalCode, `%${externalCode}%`));
    }
    if (receiverName) {
      conditions.push(like(orders.receiverName, `%${receiverName}%`));
    }
    if (startDate) {
      conditions.push(gte(orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
      // Include the entire end date by adding 1 day
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lte(orders.createdAt, end));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total orders matching the filter
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(whereClause);

    const total = Number(countResult[0]?.count ?? 0);

    // Query with JOIN - flat structure (one row per order_item)
    const offset = (page - 1) * pageSize;
    const rows = await db
      .select({
        orderId: orders.id,
        externalCode: orders.externalCode,
        storeName: orders.storeName,
        receiverName: orders.receiverName,
        receiverPhone: orders.receiverPhone,
        receiverAddress: orders.receiverAddress,
        remark: orders.remark,
        createdAt: orders.createdAt,
        skuCode: orderItems.skuCode,
        skuName: orderItems.skuName,
        skuQuantity: orderItems.skuQuantity,
        skuSpec: orderItems.skuSpec,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Format createdAt for serialization
    const data = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    }));

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data } = body as { data: Record<string, unknown>[] };

    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { error: 'data must be an array' },
        { status: 400 }
      );
    }

    const startTime = performance.now();

    // 1. 创建导入批次
    const [batch] = await db.insert(importBatches).values({
      fileName: 'web-import',
      totalCount: data.length,
      successCount: 0,
      failCount: 0,
      status: 'processing',
    }).returning();

    const batchId = batch.id;
    let successCount = 0;
    let failCount = 0;

    // 2. 分批插入数据（每批BATCH_SIZE条）
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batchData = data.slice(i, i + BATCH_SIZE);

      // 构建本批次的订单记录
      const orderValues = batchData.map((row) => ({
        externalCode: String(row.externalCode ?? ''),
        storeName: String(row.storeName ?? ''),
        receiverName: String(row.receiverName ?? ''),
        receiverPhone: String(row.receiverPhone ?? ''),
        receiverAddress: String(row.receiverAddress ?? ''),
        remark: String(row.remark ?? ''),
        batchId,
      }));

      try {
        // 批量插入订单
        const insertedOrders = await db.insert(orders).values(orderValues).returning({ id: orders.id });

        // 构建对应的SKU明细
        const itemValues = batchData.map((row, idx) => ({
          orderId: insertedOrders[idx]?.id,
          skuCode: String(row.skuCode ?? ''),
          skuName: String(row.skuName ?? ''),
          skuQuantity: String(row.skuQuantity ?? '0'),
          skuSpec: String(row.skuSpec ?? ''),
        })).filter(item => item.orderId);

        if (itemValues.length > 0) {
          await db.insert(orderItems).values(itemValues);
        }

        successCount += batchData.length;
      } catch (batchError) {
        // 批次插入失败，逐条插入以找出具体失败行
        console.warn(`[OrdersAPI] 批次${Math.floor(i / BATCH_SIZE) + 1}插入失败，回退逐条插入:`, batchError);
        for (const row of batchData) {
          try {
            const [insertedOrder] = await db.insert(orders).values({
              externalCode: String(row.externalCode ?? ''),
              storeName: String(row.storeName ?? ''),
              receiverName: String(row.receiverName ?? ''),
              receiverPhone: String(row.receiverPhone ?? ''),
              receiverAddress: String(row.receiverAddress ?? ''),
              remark: String(row.remark ?? ''),
              batchId,
            }).returning({ id: orders.id });

            if (row.skuCode) {
              await db.insert(orderItems).values({
                orderId: insertedOrder.id,
                skuCode: String(row.skuCode ?? ''),
                skuName: String(row.skuName ?? ''),
                skuQuantity: String(row.skuQuantity ?? '0'),
                skuSpec: String(row.skuSpec ?? ''),
              });
            }

            successCount++;
          } catch {
            failCount++;
          }
        }
      }
    }

    // 3. 更新批次状态
    await db.update(importBatches)
      .set({
        successCount,
        failCount,
        status: failCount > 0 ? 'partial' : 'completed',
      })
      .where(eq(importBatches.id, batchId));

    const elapsed = performance.now() - startTime;
    console.log(`[OrdersAPI] 插入完成: ${successCount}成功, ${failCount}失败, 耗时${elapsed.toFixed(0)}ms`);

    return NextResponse.json({
      successCount,
      failCount,
      batchId,
      elapsed: Math.round(elapsed),
    });
  } catch (error) {
    console.error('[OrdersAPI] 插入失败:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
