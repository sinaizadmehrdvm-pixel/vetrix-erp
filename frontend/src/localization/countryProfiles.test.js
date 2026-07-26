import { describe, it, expect } from 'vitest';
import { getCountryProfile, localeFor, formatCountryMoney, formatCountryDate, DEFAULT_COUNTRY } from './countryProfiles';

describe('getCountryProfile', () => {
  it('returns the matching profile for a known country code', () => {
    expect(getCountryProfile('US').currency).toBe('USD');
  });

  it('falls back to the default country for an unknown code', () => {
    expect(getCountryProfile('ZZ')).toBe(getCountryProfile(DEFAULT_COUNTRY));
  });
});

describe('localeFor', () => {
  it('picks the locale for the requested language', () => {
    const profile = getCountryProfile('DE');
    expect(localeFor(profile, 'en')).toBe('de-DE');
  });

  it('falls back to the language\'s own standard locale when the profile has no entry for it', () => {
    // A country profile that only defines en/fa locales (most do) should
    // still format Arabic/Turkish correctly instead of silently reverting
    // to English - otherwise switching the UI language would leave number
    // and date formatting stuck in English.
    const profile = { locale: { en: 'en-US', fa: 'fa-IR' } };
    expect(localeFor(profile, 'ar')).toBe('ar-AE');
    expect(localeFor(profile, 'tr')).toBe('tr-TR');
  });

  it('falls back to the English locale only for a language with no known fallback', () => {
    const profile = { locale: { en: 'en-US' } };
    expect(localeFor(profile, 'xx')).toBe('en-US');
  });
});

describe('formatCountryMoney', () => {
  it('formats USD with two decimal places for the US profile', () => {
    const profile = getCountryProfile('US');
    expect(formatCountryMoney(1234.5, profile, 'en')).toBe('$1,234.50');
  });

  it('respects a currency override', () => {
    const profile = getCountryProfile('US');
    const formatted = formatCountryMoney(10, profile, 'en', 'EUR');
    expect(formatted).toContain('10.00');
  });
});

describe('formatCountryDate', () => {
  // Calendar system follows the selected UI language: Jalali for Persian,
  // Hijri for Arabic, plain Gregorian for Turkish/English - regardless of
  // which country profile the company is set to (Iran is the app default).
  const profile = getCountryProfile('IR');

  it('renders Persian as the Jalali calendar', () => {
    expect(formatCountryDate('2026-03-21', profile, 'fa')).toBe('۱۴۰۵/۰۱/۰۱');
  });

  it('renders Arabic as the Hijri calendar via the app\'s own calibrated conversion, not Intl\'s tabular islamic calendar', () => {
    // 2026-03-21 is anchored to 1 Shawwal 1447 AH in utils/hijri.js.
    expect(formatCountryDate('2026-03-21', profile, 'ar')).toBe('01/10/1447');
  });

  it('renders a long Arabic Hijri month name', () => {
    expect(formatCountryDate('2026-03-21', profile, 'ar', { month: 'long' })).toBe('1 شوال 1447');
  });

  it('renders Turkish and English as plain Gregorian', () => {
    expect(formatCountryDate('2026-03-21', profile, 'tr')).toBe('21.03.2026');
    expect(formatCountryDate('2026-03-21', profile, 'en')).toContain('2026');
  });
});
