import { describe, it, expect } from 'vitest';
import { toPersianNumber, formatMoney } from './format';

describe('toPersianNumber', () => {
  it('converts ASCII digits to Persian digits', () => {
    expect(toPersianNumber(1234567)).toBe('۱۲۳۴۵۶۷');
  });

  it('returns an empty string for null or undefined', () => {
    expect(toPersianNumber(null)).toBe('');
    expect(toPersianNumber(undefined)).toBe('');
  });

  it('leaves non-digit characters untouched', () => {
    expect(toPersianNumber('1,000')).toBe('۱,۰۰۰');
  });
});

describe('formatMoney', () => {
  it('formats a positive value with thousands separators and the toman suffix', () => {
    expect(formatMoney(1234567)).toBe('۱,۲۳۴,۵۶۷ تومان');
  });

  it('formats zero with the toman suffix (0 is not treated as "no value")', () => {
    expect(formatMoney(0)).toBe('۰ تومان');
  });

  it('formats falsy non-zero values (null/undefined) as the Persian zero digit', () => {
    expect(formatMoney(null)).toBe('۰');
    expect(formatMoney(undefined)).toBe('۰');
  });
});
