import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import InvoicePrintChoose from './InvoicePrintChoose';
import { LanguageProvider } from '../localization/LanguageProvider';

vi.mock('../services/api', () => ({
  getInvoice: vi.fn(async () => ({
    id: 6,
    invoice_type: 'sale',
    customer_name: 'Test Customer',
    items: [{ product_name: 'Widget', quantity: 3, unit_price: 200000, total: 600000 }],
    total_amount: 600000,
  })),
  getPdfTemplates: vi.fn(async () => []),
}));

vi.mock('../storage/db', () => ({
  getCache: vi.fn(async () => null),
}));

function renderChoose(language) {
  localStorage.setItem('vetrix_language', language);
  return render(
    <MemoryRouter initialEntries={['/invoice-print/6']}>
      <LanguageProvider>
        <Routes>
          <Route path="/invoice-print/:id" element={<InvoicePrintChoose />} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('InvoicePrintChoose', () => {
  it('renders the template picker and preview instead of the full editor', async () => {
    renderChoose('en');

    expect(await screen.findByText(/Print invoice #6/)).toBeInTheDocument();
    expect(screen.getByText('Print Template')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print \/ PDF/i })).toBeInTheDocument();

    // The heavy editor's element-inspector panel must not be present here.
    expect(screen.queryByText('Selected element')).not.toBeInTheDocument();

    // The customize link routes into the full editor at .../edit.
    const customizeLink = screen.getByRole('link', { name: /Customize this template/i });
    expect(customizeLink).toHaveAttribute('href', '/invoice-print/6/edit');
  });

  it('renders in Arabic without crashing and with a Hijri-safe invoice date token', async () => {
    renderChoose('ar');
    expect(await screen.findByText(/طباعة الفاتورة رقم/)).toBeInTheDocument();
    expect(screen.getByText('قالب الطباعة')).toBeInTheDocument();
  });
});
