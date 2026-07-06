import { db } from '@/lib/db';
import { orderItems, orders } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { assertIntegrationAuth } from '../../_lib/auth';
import { integrationError, integrationJson } from '../../_lib/response';
import { getRequestId } from '../../_lib/request-id';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const unauthorized = assertIntegrationAuth(request, requestId);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const externalCode = String(body.externalCode || '').trim();
    const skuCode = String(body.skuCode || '').trim();

    if (!externalCode || !skuCode) {
      return integrationError(requestId, 400, 'invalid_payload', 'externalCode and skuCode are required');
    }

    const [row] = await db
      .select({
        orderId: orders.id,
        externalCode: orders.externalCode,
        storeName: orders.storeName,
        receiverName: orders.receiverName,
        skuCode: orderItems.skuCode,
        skuName: orderItems.skuName,
        skuQuantity: orderItems.skuQuantity,
        skuSpec: orderItems.skuSpec,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.externalCode, externalCode), eq(orderItems.skuCode, skuCode)))
      .limit(1);

    if (!row) {
      const [order] = await db
        .select({ id: orders.id, externalCode: orders.externalCode })
        .from(orders)
        .where(eq(orders.externalCode, externalCode))
        .limit(1);

      if (!order) {
        return integrationError(requestId, 404, 'order_not_found', 'Order does not exist in V2');
      }

      return integrationError(requestId, 422, 'sku_not_in_order', 'SKU does not belong to this order');
    }

    return integrationJson(
      {
        requestId,
        valid: true,
        order: {
          orderId: row.orderId,
          externalCode: row.externalCode,
          storeName: row.storeName,
          receiverName: row.receiverName,
        },
        item: {
          skuCode: row.skuCode,
          skuName: row.skuName,
          skuQuantity: row.skuQuantity,
          skuSpec: row.skuSpec,
        },
      },
      requestId
    );
  } catch (error) {
    console.error('[V2Integration] Failed to validate SKU', { requestId, error });
    return integrationError(requestId, 500, 'internal_error', 'Failed to validate SKU from V2');
  }
}
