import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import CalendarSection from './CalendarSection';
import { LanguageProvider } from '../localization/LanguageProvider';

function renderWithLanguage(language) {
  localStorage.setItem('vetrix_language', language);
  return render(
    <LanguageProvider>
      <CalendarSection />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('CalendarSection', () => {
  it('renders the Jalali calendar for Persian without crashing', () => {
    renderWithLanguage('fa');
    expect(screen.getAllByRole('button', { name: /امروز/ }).length).toBeGreaterThan(0);
  });

  it('renders the Hijri calendar for Arabic without crashing, and navigates months', () => {
    renderWithLanguage('ar');

    // The month title includes a Hijri month name and a 4-digit AH year.
    const heading = document.querySelector('h2');
    expect(heading).toBeTruthy();
    expect(heading.textContent).toMatch(/\d{4}/);

    const initialTitle = heading.textContent;

    // Navigating to the next/previous Hijri month should change the
    // title without throwing - this exercises hijriToGregorian(),
    // daysInHijriMonth() and addHijriMonths() together.
    const nextButton = screen.getByRole('button', { name: /الشهر التالي/ });
    fireEvent.click(nextButton);
    expect(heading.textContent).not.toBe(initialTitle);

    const prevButton = screen.getByRole('button', { name: /الشهر السابق/ });
    fireEvent.click(prevButton);
    expect(heading.textContent).toBe(initialTitle);
  });

  it('renders the Gregorian calendar for Turkish and English without crashing', () => {
    renderWithLanguage('tr');
    expect(screen.getAllByRole('button', { name: /Bugün/ }).length).toBeGreaterThan(0);

    renderWithLanguage('en');
    expect(screen.getAllByRole('button', { name: /Today/ }).length).toBeGreaterThan(0);
  });

  it('selecting a day shows its Hijri, Jalali and Gregorian equivalents in Arabic mode', () => {
    renderWithLanguage('ar');
    const dayButtons = screen.getAllByRole('button').filter((btn) => /^\d+$/.test(btn.textContent));
    expect(dayButtons.length).toBeGreaterThan(0);
    fireEvent.click(dayButtons[0]);
    // DayDetailsCard's "other calendars" list should show both a
    // Gregorian and a Jalali equivalent alongside the Hijri primary date.
    expect(screen.getByText('ميلادي')).toBeInTheDocument();
    expect(screen.getByText('الفارسي')).toBeInTheDocument();
  });
});
