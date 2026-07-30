import { describe, expect, it, vi, beforeEach } from 'vitest';
import { directoryPhonesMatch } from '@/utils/directoryPhone';

describe('directoryPhonesMatch', () => {
  it('matches E.164 variants of the same Colombian mobile', () => {
    expect(directoryPhonesMatch('+573012030253', '573012030253')).toBe(true);
    expect(directoryPhonesMatch('3012030253', '+573012030253')).toBe(true);
  });

  it('rejects different phones', () => {
    expect(directoryPhonesMatch('+573012030253', '+573046535806')).toBe(false);
    expect(directoryPhonesMatch('Monica', '+573012030253')).toBe(false);
  });
});

const updateEq = vi.fn();
const updateFn = vi.fn(() => ({ eq: updateEq }));
const maybeSingle = vi.fn();
const selectEq = vi.fn(() => ({ maybeSingle }));

vi.mock('@/config/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'crm_directory') {
        return {
          select: vi.fn(() => ({
            eq: selectEq,
          })),
          update: updateFn,
        };
      }
      return {};
    }),
    rpc: vi.fn(),
  },
}));

describe('directoryService.updateEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({
      data: {
        id: 'entry-a',
        full_name: 'Old',
        display_name: 'Old',
        phone: '+573001111111',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        classification: 'unknown',
        quality_tag: 'standard',
        status: 'active',
        channels: [],
        tags: [],
        metadata: {},
        is_app_user: false,
        pending_amount: 0,
        pending_appointments_count: 0,
        messages_count: 0,
        sequence_step: 0,
        opt_out: false,
        unread_whatsapp_count: 0,
        otp_required: false,
        active_sequence: 'NINGUNA',
      },
      error: null,
    });
    updateEq.mockResolvedValue({ error: null });
  });

  it('updates only by id and never calls upsert_directory_entry', async () => {
    const { directoryService } = await import('@/services/directoryService');
    const { supabase } = await import('@/config/supabase');

    const result = await directoryService.updateEntry('entry-a', {
      fullName: 'Monica Cerritos',
      displayName: 'Monica Cerritos',
    });

    expect(result).toEqual({ id: 'entry-a', success: true });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'Monica Cerritos',
        display_name: 'Monica Cerritos',
      }),
    );
    expect(updateEq).toHaveBeenCalledWith('id', 'entry-a');
  });
});
