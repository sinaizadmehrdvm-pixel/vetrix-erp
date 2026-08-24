import { describe, it, expect } from 'vitest';
import { toPersianDigits, formatNumber } from './numbers';

describe('toPersianDigits', () => {
  it('converts ASCII digits in a number to Persian digits', () => {
    expect(toPersianDigits(2026)).toBe('۲۰۲۶');
  });

  it('converts ASCII digits inside a string', () => {
    expect(toPersianDigits('order-42')).toBe('order-۴۲');
  });
});

describe('formatNumber', () => {
  it('formats with thousands separators for English', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
  });

  it('formats with Persian digits and grouping for Persian', () => {
    expect(formatNumber(1234567, 'fa')).toBe('۱,۲۳۴,۵۶۷');
  });

  it('treats a missing value as zero', () => {
    expect(formatNumber(undefined, 'en')).toBe('0');
    expect(formatNumber(null, 'en')).toBe('0');
  });
});
