import { NextResponse } from 'next/server';

export function integrationJson(body: unknown, requestId: string, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      'x-request-id': requestId,
      ...(init?.headers || {}),
    },
  });
}

export function integrationError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  return integrationJson(
    {
      requestId,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    requestId,
    { status }
  );
}
