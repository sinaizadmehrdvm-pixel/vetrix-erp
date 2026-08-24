import { describe, it, expect } from 'vitest';
import {
  toEnglishDigits,
  cleanNumberInput,
  parseNumberInput,
  formatMoney,
} from './helpers';

describe('toEnglishDigits', () => {
  it('converts Persian digits back to ASCII', () => {
    expect(toEnglishDigits('۱۲۳۴۵۶۷')).toBe('1234567');
  });

  it('converts Arabic-Indic digits back to ASCII', () => {
    expect(toEnglishDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('returns an empty string for null or undefined', () => {
    expect(toEnglishDigits(null)).toBe('');
    expect(toEnglishDigits(undefined)).toBe('');
  });
});

describe('cleanNumberInput', () => {
  it('strips non-numeric characters after normalizing digits', () => {
    expect(cleanNumberInput('۱۲,۳۴۰ تومان')).toBe('12340');
  });

  it('keeps a decimal point and a leading minus sign', () => {
    expect(cleanNumberInput('-12.5abc')).toBe('-12.5');
  });
});

describe('parseNumberInput', () => {
  it('parses a Persian-formatted number string into a JS number', () => {
    expect(parseNumberInput('۱,۲۳۴')).toBe(1234);
  });

  it('falls back to zero for non-numeric input', () => {
    expect(parseNumberInput('abc')).toBe(0);
  });

  it('parses negative and decimal values', () => {
    expect(parseNumberInput('-42.75')).toBe(-42.75);
  });
});

describe('formatMoney (localization/helpers)', () => {
  it('formats Persian money with Persian digits and the toman suffix', () => {
    const result = formatMoney(2500, 'fa');
    expect(result).toMatch(/^۲.۵۰۰ تومان$/);
    expect(result.endsWith('تومان')).toBe(true);
  });

  it('formats Turkish money with a lira prefix', () => {
    expect(formatMoney(2500, 'tr')).toBe('₺2.500');
  });

  it('formats English money with a dollar prefix by default', () => {
    expect(formatMoney(2500)).toBe('$2,500');
  });
});
