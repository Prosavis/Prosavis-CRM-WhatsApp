import { describe, expect, it } from 'vitest';
import {
  cancellationReasonLabel,
  clampDirectoryOffset,
  clampDirectoryPageSize,
  derivePaymentDisplay,
  mapDirectoryWorkspaceCancellations,
  mapDirectoryWorkspacePage,
  mapDirectoryWorkspaceSnapshot,
  requireDirectoryId,
  resolveDirectoryWorkspaceView,
} from './directoryWorkspace';

describe('directoryWorkspace contract', () => {
  it('maps the five KPI names and page identity fields', () => {
    expect(resolveDirectoryWorkspaceView('directorio')).toBe('all');
    expect(mapDirectoryWorkspaceSnapshot({
      total: 10,
      scheduled: 7,
      canceledOrRejected: 3,
      recurring: 2,
      reactivation: 1,
    })).toEqual({
      total: 10,
      scheduled: 7,
      canceledOrRejected: 3,
      recurring: 2,
      reactivation: 1,
    });
    const page = mapDirectoryWorkspacePage([{
      id: '41000000-0000-4000-8000-000000000003',
      full_name: 'Lucia Cancelo',
      last_completed_payment_status: 'PAGO_EN_PROCESO',
      computed_debt: 25000,
      matched_count: 3,
    }], 1, 0);
    expect(page.items[0]?.id).toBe('41000000-0000-4000-8000-000000000003');
    expect(page.hasMore).toBe(true);
    expect(derivePaymentDisplay(page.items[0]?.lastCompletedPaymentStatus)).toBe('EN_PROCESO');
  });

  it('keeps every cancellation incident and rejects an empty directory id', () => {
    expect(clampDirectoryPageSize(500)).toBe(100);
    expect(clampDirectoryOffset(-4)).toBe(0);
    expect(() => requireDirectoryId('')).toThrow('directoryId es obligatorio.');
    const incidents = mapDirectoryWorkspaceCancellations([
      { appointment_id: 'apt-new', status: 'REJECTED', cancellation_reason: 'no_confirmo' },
      {
        appointment_id: 'apt-old',
        status: 'CANCELED',
        cancellation_reason: 'cliente_viaja_aplaza',
        cancellation_reason_other: 'Se va de viaje',
      },
    ]);
    expect(incidents).toHaveLength(2);
    expect(cancellationReasonLabel(incidents[1]?.reason)).toBe('El cliente viaja o aplaza');
  });
});
