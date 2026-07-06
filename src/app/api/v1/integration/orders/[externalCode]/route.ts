import { db } from '@/lib/db';
import { orderItems, orders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { assertIntegrationAuth } from '../../_lib/auth';
import { integrationError, integrationJson } from '../../_lib/response';
import { getRequestId } from '../../_lib/request-id';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ externalCode: string }> }
) {
  const requestId = getRequestId(request);
  const unauthorized = assertIntegrationAuth(request, requestId);
  if (unauthorized) return unauthorized;

  const { externalCode } = await params;
  const decodedExternalCode = decodeURIComponent(externalCode || '').trim();
  if (!decodedExternalCode) {
    return integrationError(requestId, 400, 'invalid_external_code', 'externalCode is required');
  }

  try {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.externalCode, decodedExternalCode))
      .limit(1);

    if (!order) {
      return integrationError(requestId, 404, 'order_not_found', 'Order does not exist in V2');
    }

    const items = await db
      .select({
        skuCode: orderItems.skuCode,
        skuName: orderItems.skuName,
        skuQuantity: orderItems.skuQuantity,
        skuSpec: orderItems.skuSpec,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    return integrationJson(
      {
        requestId,
        data: {
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
        },
      },
      requestId
    );
  } catch (error) {
    console.error('[V2Integration] Failed to fetch order', { requestId, error });
    return integrationError(requestId, 500, 'internal_error', 'Failed to fetch order from V2');
  }
}
