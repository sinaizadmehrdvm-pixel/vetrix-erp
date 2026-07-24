import { describe, it, expect } from 'vitest';
import { calcProfit } from './accounting';

describe('calcProfit', () => {
  it('computes gross and net profit from sales, purchases and expenses', () => {
    const result = calcProfit({ total_sales: 1000, total_purchases: 400, total_expenses: 150 });
    expect(result).toEqual({ grossProfit: 600, netProfit: 450 });
  });

  it('treats missing fields as zero', () => {
    expect(calcProfit({})).toEqual({ grossProfit: 0, netProfit: 0 });
  });

  it('allows negative profit when expenses exceed sales', () => {
    const result = calcProfit({ total_sales: 100, total_purchases: 50, total_expenses: 200 });
    expect(result.grossProfit).toBe(50);
    expect(result.netProfit).toBe(-150);
  });

  it('ignores unrelated fields on the input object', () => {
    const result = calcProfit({ total_sales: 500, total_purchases: 200, total_expenses: 50, note: 'irrelevant' });
    expect(result).toEqual({ grossProfit: 300, netProfit: 250 });
  });
});
