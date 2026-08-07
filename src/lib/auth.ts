export function checkApiKey(request: Request): Response | null {
  const expected = process.env.IMPORT_API_KEY;
  if (!expected) return null;

  const header =
    request.headers.get('x-api-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (header === expected) return null;

  return Response.json({ error: 'Unauthorized: invalid or missing API key' }, { status: 401 });
}

export function clientHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const key = window.sessionStorage.getItem('import_api_key');
    if (key) headers['x-api-key'] = key;
  }
  return headers;
}
