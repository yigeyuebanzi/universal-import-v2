import { NextResponse } from 'next/server';

export function assertIntegrationAuth(request: Request, requestId: string) {
  const expected = process.env.V2_INTEGRATION_API_KEY;
  const actual = request.headers.get('x-api-key');

  if (!expected) {
    return NextResponse.json(
      { requestId, error: { code: 'integration_key_missing', message: 'V2 integration API key is not configured' } },
      { status: 500, headers: { 'x-request-id': requestId } }
    );
  }

  if (!actual || actual !== expected) {
    return NextResponse.json(
      { requestId, error: { code: 'unauthorized', message: 'Invalid integration API key' } },
      { status: 401, headers: { 'x-request-id': requestId } }
    );
  }

  return null;
}
