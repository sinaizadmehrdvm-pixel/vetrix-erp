import { describe, it, expect } from 'vitest';
import { getCountryProfile, localeFor, formatCountryMoney, DEFAULT_COUNTRY } from './countryProfiles';

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

  it('falls back to the English locale when the language is missing', () => {
    const profile = { locale: { en: 'en-US' } };
    expect(localeFor(profile, 'fa')).toBe('en-US');
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
