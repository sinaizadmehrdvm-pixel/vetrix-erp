import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

import Login from './Login';
import { AuthProvider } from '../auth/AuthContext';
import { LanguageProvider } from '../localization/LanguageProvider';

function renderLogin() {
  return render(
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = vi.fn();
});

describe('Login', () => {
  it('shows the checking state before the setup status responds', () => {
    globalThis.fetch.mockReturnValue(new Promise(() => {}));
    renderLogin();
    expect(screen.getByText(/checking installation/i)).toBeInTheDocument();
  });

  it('renders the first-run admin setup form when requires_admin is true', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ requires_admin: true, version: '9.9.9' }),
    });

    renderLogin();

    expect(
      await screen.findByRole('button', { name: /create administrator & sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/administrator full name/i)).toBeInTheDocument();
    expect(screen.getByText('v9.9.9')).toBeInTheDocument();
  });

  it('renders the normal login form when requires_admin is false', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ requires_admin: false, version: '1.1.0' }),
    });

    renderLogin();

    expect(await screen.findByRole('button', { name: /^login$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/administrator full name/i)).not.toBeInTheDocument();
  });

  it('falls back to the login form and shows an error when the status check fails', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network down'));

    renderLogin();

    expect(await screen.findByRole('button', { name: /^login$/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
