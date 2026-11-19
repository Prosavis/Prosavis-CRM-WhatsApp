import { describe, expect, it } from 'vitest';
import {
  archiveLossDecision,
  isLossReasonRequiredError,
  phoneHasLiveAppointment,
  salesChatNeedsLossReason,
} from '../../supabase/functions/_shared/lossReasonGate';

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

describe('archiveLossDecision', () => {
  it('asks for a reason only after a sales chat is known to have no live appointment', () => {
    expect(archiveLossDecision({
      intake: 'hogar',
      fromAd: false,
      lossReason: null,
      appointmentsLoadFailed: false,
      hasAppointment: false,
    })).toBe('need_reason');
    expect(archiveLossDecision({
      intake: 'empleo',
      fromAd: true,
      lossReason: null,
      appointmentsLoadFailed: false,
      hasAppointment: false,
    })).toBe('need_reason');
  });

  it('allows the archive when there is a reason, an appointment, or the chat is not a sale', () => {
    expect(archiveLossDecision({
      intake: 'hogar',
      fromAd: false,
      lossReason: 'precio',
      appointmentsLoadFailed: true,
      hasAppointment: false,
    })).toBe('allow');
    expect(archiveLossDecision({
      intake: 'empresas',
      fromAd: false,
      lossReason: null,
      appointmentsLoadFailed: false,
      hasAppointment: true,
    })).toBe('allow');
    expect(archiveLossDecision({
      intake: 'empleo',
      fromAd: false,
      lossReason: null,
      appointmentsLoadFailed: true,
      hasAppointment: false,
    })).toBe('allow');
  });

  it('stops a sales chat when appointments cannot be checked', () => {
    expect(archiveLossDecision({
      intake: 'hogar',
      fromAd: false,
      lossReason: null,
      appointmentsLoadFailed: true,
      hasAppointment: false,
    })).toBe('appointments_unknown');
  });

  it('recognizes the archive rejection by code', () => {
    expect(isLossReasonRequiredError({ code: 'loss_reason_required' })).toBe(true);
    expect(isLossReasonRequiredError({ code: 'appointments_unknown' })).toBe(false);
    expect(isLossReasonRequiredError(new Error('Elige el motivo'))).toBe(false);
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
