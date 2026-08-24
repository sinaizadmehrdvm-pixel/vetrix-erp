import { describe, it, expect } from 'vitest';
import { formatCurrency, getDirection } from './format';

describe('formatCurrency', () => {
  it('appends the toman suffix for Persian', () => {
    expect(formatCurrency(1000, 'fa')).toBe('۱,۰۰۰ تومان');
  });

  it('prefixes a dollar sign for English', () => {
    expect(formatCurrency(1000, 'en')).toBe('$1,000');
  });

  it('defaults to English formatting when no language is given', () => {
    expect(formatCurrency(50)).toBe('$50');
  });
});

describe('getDirection', () => {
  it('returns rtl for Persian', () => {
    expect(getDirection('fa')).toBe('rtl');
  });

  it('returns ltr for English and any other language', () => {
    expect(getDirection('en')).toBe('ltr');
    expect(getDirection('tr')).toBe('ltr');
  });
});
