import { describe, expect, it } from 'vitest';
import {
  buildInboxAiClientIdAppointmentQuery,
  buildInboxAiClientPhoneAppointmentQuery,
  filterAppointmentsByLookback,
} from '../../supabase/functions/_shared/inboxAiAppointmentQuery';

describe('buildInboxAiClientIdAppointmentQuery', () => {
  it('filters by clientId and scheduledDate with ASC order for the existing index', () => {
    const query = buildInboxAiClientIdAppointmentQuery(
      'clientId',
      '0a69d1c3-56db-4b37-8df4-31f640709092',
      '2025-02-21T00:00:00.000Z',
    );
    expect(query.orderBy).toEqual([
      { field: { fieldPath: 'scheduledDate' }, direction: 'ASCENDING' },
    ]);
    const filters = (query.where as {
      compositeFilter: { filters: Array<{ fieldFilter: { field: { fieldPath: string } } }> };
    }).compositeFilter.filters;
    expect(filters.map((filter) => filter.fieldFilter.field.fieldPath)).toEqual([
      'clientId',
      'scheduledDate',
    ]);
  });
});

describe('buildInboxAiClientPhoneAppointmentQuery', () => {
  it('queries phone equality without a scheduledDate order', () => {
    const query = buildInboxAiClientPhoneAppointmentQuery('clientPhone', '+573150004639');
    expect(query.orderBy).toBeUndefined();
    expect(query.where).toEqual({
      fieldFilter: {
        field: { fieldPath: 'clientPhone' },
        op: 'EQUAL',
        value: { stringValue: '+573150004639' },
      },
    });
  });
});

describe('filterAppointmentsByLookback', () => {
  it('keeps appointments on or after the lookback instant', () => {
    const kept = filterAppointmentsByLookback(
      [
        { id: 'old', scheduledDate: '2024-01-01T00:00:00.000Z' },
        { id: 'recent', scheduledDate: '2026-08-21T19:00:00.000Z' },
      ],
      '2025-02-21T00:00:00.000Z',
    );
    expect(kept.map((appointment) => appointment.id)).toEqual(['recent']);
  });
});
