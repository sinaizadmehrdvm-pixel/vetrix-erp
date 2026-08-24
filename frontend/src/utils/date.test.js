import { describe, it, expect } from 'vitest';
import { toJalali, todayJalali, fromJalali, toHijriText, todayHijri, fromHijriText } from './date';

describe('toJalali', () => {
  it('converts a Gregorian date string to jYYYY/jMM/jDD format using Persian digits', () => {
    // Every other Persian-language number in this app renders with Persian
    // digits via the n() helper - toJalali() is only ever used to display
    // a Persian date, so its digits must match, not fall back to Latin.
    expect(toJalali('2024-03-20')).toBe('۱۴۰۳/۰۱/۰۱');
  });

  it('returns an empty string when no date is given', () => {
    expect(toJalali(null)).toBe('');
    expect(toJalali(undefined)).toBe('');
    expect(toJalali('')).toBe('');
  });
});

describe('todayJalali', () => {
  it('returns today in Persian-digit jYYYY/jMM/jDD format', () => {
    expect(todayJalali()).toMatch(/^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/);
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

describe('toHijriText', () => {
  it('converts a Gregorian date to hYYYY/hMM/hDD format using the calibrated anchors', () => {
    // 1 Shawwal 1447 AH is anchored to 2026-03-21 in utils/hijri.js.
    expect(toHijriText('2026-03-21')).toBe('1447/10/01');
  });

  it('returns an empty string when no date is given', () => {
    expect(toHijriText(null)).toBe('');
    expect(toHijriText(undefined)).toBe('');
    expect(toHijriText('')).toBe('');
  });
});

describe('todayHijri', () => {
  it('returns today in hYYYY/hMM/hDD format matching the digit pattern', () => {
    expect(todayHijri()).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });
});

describe('fromHijriText', () => {
  it('converts an hYYYY/hMM/hDD string back to a Gregorian ISO date', () => {
    expect(fromHijriText('1447/10/01')).toBe('2026-03-21');
  });

  it('accepts dash separators', () => {
    expect(fromHijriText('1447-10-01')).toBe('2026-03-21');
  });

  it('round-trips through toHijriText for an arbitrary date', () => {
    expect(fromHijriText(toHijriText('2026-08-14'))).toBe('2026-08-14');
  });

  it('returns an empty string for incomplete or invalid input', () => {
    expect(fromHijriText('')).toBe('');
    expect(fromHijriText('1447/10')).toBe('');
    expect(fromHijriText('not a date')).toBe('');
  });
});
