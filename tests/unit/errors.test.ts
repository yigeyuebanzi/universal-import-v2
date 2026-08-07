import { describe, expect, it } from 'vitest';
import {
  errorCodeLabel,
  maskSensitiveValue,
  shouldMask,
  suggestionFor,
} from '@/lib/errors';

describe('error utilities', () => {
  it('masks phone numbers', () => {
    expect(maskSensitiveValue('receiverPhone', '13812345678')).toBe('138****5678');
  });

  it('masks addresses but keeps searchable prefix/suffix', () => {
    expect(maskSensitiveValue('receiverAddress', '上海市浦东新区测试路1234号')).toBe(
      '上海市浦东新***234号'
    );
  });

  it('flags sensitive fields', () => {
    expect(shouldMask('receiverPhone')).toBe(true);
    expect(shouldMask('receiverAddress')).toBe(true);
    expect(shouldMask('skuCode')).toBe(false);
  });

  it('provides readable labels and suggestions', () => {
    expect(errorCodeLabel('E001')).toContain('SKU');
    expect(suggestionFor('E003')).toContain('手机号');
  });
});
