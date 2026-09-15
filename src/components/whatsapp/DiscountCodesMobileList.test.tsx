import '@/test/setup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DiscountCodeData } from '@/services/discountCodesService';
import DiscountCodesMobileList from './DiscountCodesMobileList';

const code: DiscountCodeData = {
  id: 'discount-1',
  code: 'MOVIL20',
  discountType: 'percentage',
  discountPercent: 20,
  discountAmountCOP: 0,
  maxRedemptions: 10,
  redemptionCount: 2,
  status: 'active',
  createdBy: 'admin',
  createdAt: '2026-09-15T12:00:00Z',
};

describe('DiscountCodesMobileList', () => {
  it('renders code details and touch actions without a wide table', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <DiscountCodesMobileList
        codes={[code]}
        loading={false}
        onCopy={onCopy}
        onEdit={onEdit}
        onDelete={onDelete}
        onPermanentDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('20%')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Copiar código MOVIL20' }));
    await user.click(screen.getByRole('button', { name: 'Editar código MOVIL20' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar código MOVIL20' }));

    expect(onCopy).toHaveBeenCalledWith('MOVIL20');
    expect(onEdit).toHaveBeenCalledWith(code);
    expect(onDelete).toHaveBeenCalledWith(code);
  });
});
