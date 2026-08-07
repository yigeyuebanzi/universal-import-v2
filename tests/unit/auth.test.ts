import { afterEach, describe, expect, it } from 'vitest';
import { checkApiKey } from '@/lib/auth';

describe('checkApiKey', () => {
  const original = process.env.IMPORT_API_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.IMPORT_API_KEY;
    else process.env.IMPORT_API_KEY = original;
  });

  it('allows when no key is configured', () => {
    delete process.env.IMPORT_API_KEY;
    const req = new Request('http://localhost/api/import-tasks');
    expect(checkApiKey(req)).toBeNull();
  });

  it('rejects missing key when configured', () => {
    process.env.IMPORT_API_KEY = 'secret';
    const req = new Request('http://localhost/api/import-tasks');
    const res = checkApiKey(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it('accepts valid x-api-key header', () => {
    process.env.IMPORT_API_KEY = 'secret';
    const req = new Request('http://localhost/api/import-tasks', {
      headers: { 'x-api-key': 'secret' },
    });
    expect(checkApiKey(req)).toBeNull();
  });

  it('accepts Bearer token', () => {
    process.env.IMPORT_API_KEY = 'secret';
    const req = new Request('http://localhost/api/import-tasks', {
      headers: { authorization: 'Bearer secret' },
    });
    expect(checkApiKey(req)).toBeNull();
  });
});
