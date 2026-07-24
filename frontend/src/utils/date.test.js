import { describe, it, expect } from 'vitest';
import { toJalali, todayJalali } from './date';

describe('toJalali', () => {
  it('converts a Gregorian date string to jYYYY/jMM/jDD format', () => {
    expect(toJalali('2024-03-20')).toBe('1403/01/01');
  });

  it('returns an empty string when no date is given', () => {
    expect(toJalali(null)).toBe('');
    expect(toJalali(undefined)).toBe('');
    expect(toJalali('')).toBe('');
  });
});

describe('todayJalali', () => {
  it('returns today in jYYYY/jMM/jDD format matching the digit pattern', () => {
    expect(todayJalali()).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });
});
