import { describe, expect, it } from 'vitest';
import { phoneHasLiveAppointment, salesChatNeedsLossReason } from '../../supabase/functions/_shared/lossReasonGate';

describe('salesChatNeedsLossReason', () => {
  it('blocks a sales chat with no appointment and no reason', () => {
    expect(salesChatNeedsLossReason({
      archiving: true,
      intake: 'hogar',
      fromAd: false,
      hasAppointment: false,
      lossReason: null,
    })).toBe(true);
    expect(salesChatNeedsLossReason({
      archiving: true,
      intake: 'empleo',
      fromAd: true,
      hasAppointment: false,
      lossReason: null,
    })).toBe(true);
  });

  it('lets a chat through when it has an appointment, a reason, or is not a sale', () => {
    expect(salesChatNeedsLossReason({
      archiving: true,
      intake: 'hogar',
      fromAd: false,
      hasAppointment: true,
      lossReason: null,
    })).toBe(false);
    expect(salesChatNeedsLossReason({
      archiving: true,
      intake: 'empresas',
      fromAd: false,
      hasAppointment: false,
      lossReason: 'precio',
    })).toBe(false);
    expect(salesChatNeedsLossReason({
      archiving: true,
      intake: 'empleo',
      fromAd: false,
      hasAppointment: false,
      lossReason: null,
    })).toBe(false);
    expect(salesChatNeedsLossReason({
      archiving: false,
      intake: 'hogar',
      fromAd: true,
      hasAppointment: false,
      lossReason: null,
    })).toBe(false);
  });
});

describe('phoneHasLiveAppointment', () => {
  it('matches the last 10 digits and ignores canceled appointments', () => {
    expect(phoneHasLiveAppointment('573001112233', [
      { clientPhone: '3001112233', status: 'CANCELED' },
    ])).toBe(false);
    expect(phoneHasLiveAppointment('+57 300 111 2233', [
      { clientPhone: '3001112233', status: 'CONFIRMED' },
    ])).toBe(true);
  });
});
