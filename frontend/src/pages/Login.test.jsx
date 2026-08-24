import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import Login from './Login';
import { AuthProvider } from '../auth/AuthContext';
import { LanguageProvider } from '../localization/LanguageProvider';

function renderAuth(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LanguageProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Login />} />
            <Route path="/forgot-password" element={<Login />} />
          </Routes>
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

function setupStatus(payload) {
  return {
    ok: true,
    json: async () => ({ version: '1.4.1', ...payload }),
  };
}

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = vi.fn();
});

describe('Login auth experience', () => {
  it('shows the checking state before setup status responds', () => {
    globalThis.fetch.mockReturnValue(new Promise(() => {}));
    renderAuth('/login');
    expect(screen.getByText(/checking installation/i)).toBeInTheDocument();
  });

  it('renders the first-run administrator form on /register when the database is empty', async () => {
    globalThis.fetch.mockResolvedValue(setupStatus({ requires_admin: true, initialized: false }));

    renderAuth('/register');

    expect(await screen.findByRole('button', { name: /create administrator/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByText('v1.4.1')).toBeInTheDocument();
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();
  });

  it('renders normal sign-in on /login after initialization', async () => {
    globalThis.fetch.mockResolvedValue(setupStatus({ requires_admin: false, initialized: true }));

    renderAuth('/login');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /create account/i }).some((link) => link.getAttribute('href') === '/register')).toBe(true);
    expect(screen.getAllByRole('link', { name: /forgot password/i }).some((link) => link.getAttribute('href') === '/forgot-password')).toBe(true);
  });

  it('shows administrator-controlled registration after initialization', async () => {
    globalThis.fetch.mockResolvedValue(setupStatus({ requires_admin: false, initialized: true }));

    renderAuth('/register');

    expect(await screen.findByText(/account creation is administrator-controlled/i)).toBeInTheDocument();
    expect(screen.getByText(/ask a system administrator/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /back to sign in/i }).some((link) => link.getAttribute('href') === '/login')).toBe(true);
    expect(screen.queryByRole('button', { name: /create administrator/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();
  });

  it('submits forgot-password without exposing account existence', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(setupStatus({ requires_admin: false, initialized: true }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'accepted',
          recovery_mode: 'administrator_reset',
          message: 'generic',
        }),
      });
    const user = userEvent.setup();
    const fetchSpy = globalThis.fetch;

    renderAuth('/forgot-password');

    expect(await screen.findByText(/no email or SMS reset/i)).toBeInTheDocument();
    expect(screen.getByText(/User Management/i)).toBeInTheDocument();
    await user.type(await screen.findByLabelText(/^username$/i), 'any-user');
    await user.click(screen.getByRole('button', { name: /request recovery/i }));

    await waitFor(() => {
      expect(screen.getByText(/system administrator must reset it in User Management/i)).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/forgot-password'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('switches language immediately and persists RTL direction', async () => {
    globalThis.fetch.mockResolvedValue(setupStatus({ requires_admin: false, initialized: true }));
    const user = userEvent.setup();

    renderAuth('/login');

    const selector = await screen.findByLabelText(/language/i);
    await user.selectOptions(selector, 'fa');

    await waitFor(() => {
      expect(document.documentElement.dir).toBe('rtl');
      expect(localStorage.getItem('vetrix_language')).toBe('fa');
    });
    expect(await screen.findByRole('button', { name: /^ورود$/ })).toBeInTheDocument();
  });
});
