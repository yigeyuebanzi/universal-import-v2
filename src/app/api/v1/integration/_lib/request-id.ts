export function getRequestId(request: Request) {
  return request.headers.get('x-request-id') || crypto.randomUUID();
}
