import { db } from '@/lib/db';
import { orderItems, orders } from '@/lib/db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { assertIntegrationAuth } from '../_lib/auth';
import { integrationError, integrationJson } from '../_lib/response';
import { getRequestId } from '../_lib/request-id';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const unauthorized = assertIntegrationAuth(request, requestId);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') || '50')));
    const updatedAfter = searchParams.get('updatedAfter');

    const conditions = [];
    if (updatedAfter) {
      const since = new Date(updatedAfter);
      if (Number.isNaN(since.getTime())) {
        return integrationError(requestId, 400, 'invalid_updated_after', 'updatedAfter must be a valid ISO datetime');
      }
      conditions.push(gte(orders.createdAt, since));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(distinct ${orders.id})` })
      .from(orders)
      .where(whereClause);

    const orderRows = await db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const data = [];
    for (const order of orderRows) {
      const items = await db
        .select({
          skuCode: orderItems.skuCode,
          skuName: orderItems.skuName,
          skuQuantity: orderItems.skuQuantity,
          skuSpec: orderItems.skuSpec,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      data.push({
        orderId: order.id,
        externalCode: order.externalCode,
        storeName: order.storeName,
        receiverName: order.receiverName,
        receiverPhone: order.receiverPhone,
        receiverAddress: order.receiverAddress,
        remark: order.remark,
        createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
        amount: null,
        items,
      });
    }

    return integrationJson(
      {
        requestId,
        data,
        page,
        pageSize,
        total: Number(count || 0),
      },
      requestId
    );
  } catch (error) {
    console.error('[V2Integration] Failed to sync orders', { requestId, error });
    return integrationError(requestId, 500, 'internal_error', 'Failed to sync orders from V2');
  }
}
