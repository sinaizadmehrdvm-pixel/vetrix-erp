import { describe, it, expect } from 'vitest';
import { toJalali, todayJalali, fromJalali } from './date';

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

describe('fromJalali', () => {
  it('converts a jYYYY/jMM/jDD string back to a Gregorian ISO date', () => {
    expect(fromJalali('1403/01/01')).toBe('2024-03-20');
  });

  it('accepts Persian digits and dash separators', () => {
    expect(fromJalali('۱۴۰۳-۰۱-۰۱')).toBe('2024-03-20');
  });

  it('returns an empty string for incomplete or invalid input', () => {
    expect(fromJalali('')).toBe('');
    expect(fromJalali('1403/01')).toBe('');
    expect(fromJalali('not a date')).toBe('');
  });
});
