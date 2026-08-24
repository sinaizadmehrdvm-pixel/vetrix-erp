import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './useTheme';

function ThemeToggleProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button
        type="button"
        aria-label="toggle theme"
        onClick={() => setTheme(theme === 'light' ? 'midnight' : 'light')}
      >
        {theme === 'light' ? 'sun' : 'moon'}
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeProvider', () => {
  it('defaults to the midnight theme and sets it on the document root', () => {
    render(
      <ThemeProvider>
        <ThemeToggleProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('current-theme')).toHaveTextContent('midnight');
    expect(document.documentElement.dataset.theme).toBe('midnight');
  });

  it('toggles between midnight and light when the toggle button is clicked, updating the document and localStorage', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggleProbe />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: /toggle theme/i });

    await user.click(button);
    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(localStorage.getItem('vetrix-theme')).toBe('light');

    await user.click(button);
    expect(screen.getByTestId('current-theme')).toHaveTextContent('midnight');
    expect(document.documentElement.dataset.theme).toBe('midnight');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem('vetrix-theme')).toBe('midnight');
  });

  it('normalizes legacy theme ids ("dark", "neon") stored in localStorage to midnight', () => {
    localStorage.setItem('vetrix-theme', 'dark');
    render(
      <ThemeProvider>
        <ThemeToggleProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('current-theme')).toHaveTextContent('midnight');
  });

  it('restores a previously persisted valid theme from localStorage', () => {
    localStorage.setItem('vetrix-theme', 'emerald');
    render(
      <ThemeProvider>
        <ThemeToggleProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('current-theme')).toHaveTextContent('emerald');
  });
});
