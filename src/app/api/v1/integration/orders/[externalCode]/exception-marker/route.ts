import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { assertIntegrationAuth } from '../../../_lib/auth';
import { integrationError, integrationJson } from '../../../_lib/response';
import { getRequestId } from '../../../_lib/request-id';

export const dynamic = 'force-dynamic';

export async function POST(
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
      .select({ id: orders.id, externalCode: orders.externalCode })
      .from(orders)
      .where(eq(orders.externalCode, decodedExternalCode))
      .limit(1);

    if (!order) {
      return integrationError(requestId, 404, 'order_not_found', 'Order does not exist in V2');
    }

    const body = await request.json().catch(() => ({}));
    console.info('[V2Integration] Exception marker accepted', {
      requestId,
      externalCode: decodedExternalCode,
      marker: body,
    });

    return integrationJson(
      {
        requestId,
        accepted: true,
        message: 'Exception marker accepted. V2 stores no marker table in the current schema.',
      },
      requestId
    );
  } catch (error) {
    console.error('[V2Integration] Failed to accept exception marker', { requestId, error });
    return integrationError(requestId, 500, 'internal_error', 'Failed to accept exception marker');
  }
}
