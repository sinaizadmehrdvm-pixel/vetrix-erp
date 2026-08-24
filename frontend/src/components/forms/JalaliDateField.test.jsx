import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import JalaliDateField from './JalaliDateField';

describe('JalaliDateField', () => {
  it('shows a Persian-digit Jalali date and lets the user pick a day from the popup calendar', () => {
    const onChange = vi.fn();
    render(<JalaliDateField value="2026-07-26" onChange={onChange} fa language="fa" />);

    // Displayed text uses Persian digits, matching every other Persian
    // number in the app, not the Latin digits moment-jalaali defaults to.
    expect(screen.getByDisplayValue('۱۴۰۵/۰۵/۰۴')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /انتخاب تاریخ/ }));
    const dayButtons = screen.getAllByRole('button').filter((btn) => /^[۰-۹]+$/.test(btn.textContent));
    expect(dayButtons.length).toBeGreaterThan(0);

    fireEvent.click(dayButtons[0]);
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('shows a Hijri date for Arabic and opens a Hijri popup calendar', () => {
    const onChange = vi.fn();
    render(<JalaliDateField value="2026-03-21" onChange={onChange} language="ar" />);

    expect(screen.getByDisplayValue('1447/10/01')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /اختيار التاريخ/ }));
    fireEvent.click(screen.getByText('اليوم'));
    expect(onChange).toHaveBeenCalled();
  });

  it('shows a plain Gregorian date for English/Turkish with no calendar conversion', () => {
    render(<JalaliDateField value="2026-07-26" onChange={() => {}} language="en" />);
    expect(screen.getByDisplayValue('2026-07-26')).toBeInTheDocument();
  });

  it('navigates to the next/previous month inside the popup without crashing', () => {
    render(<JalaliDateField value="2026-07-26" onChange={() => {}} fa language="fa" />);
    fireEvent.click(screen.getByRole('button', { name: /انتخاب تاریخ/ }));
    const title = screen.getByText(/۱۴۰۵/);
    const initialTitle = title.textContent;

    const prevButton = screen.getByRole('button', { name: 'ماه قبل' });
    const nextButton = screen.getByRole('button', { name: 'ماه بعد' });
    fireEvent.click(nextButton);
    expect(screen.queryByText(initialTitle)).not.toBeInTheDocument();
    fireEvent.click(prevButton);
    expect(screen.getByText(initialTitle)).toBeInTheDocument();
  });
});
