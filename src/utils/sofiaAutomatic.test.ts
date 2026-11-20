import { describe, expect, it } from 'vitest';
import {
  appointmentConfirmation,
  claimsBooked,
  classifyInbound,
  noticeName,
  pickBooking,
  reviewDisposition,
  staffNoticeCopy,
  storedDraftSend,
} from '../../supabase/functions/_shared/sofiaAutomatic';

describe('classifyInbound', () => {
  it('despide un no y eleva lo que no puede cerrar', () => {
    expect(classifyInbound('Por ahora no gracias').kind).toBe('no');
    expect(classifyInbound('márcame por favor').motivo).toBe('pidió una llamada');
    expect(classifyInbound('Les mando el comprobante').motivo).toBe('comprobante');
    expect(classifyInbound('Quiero cambiar la cita').motivo).toBe('mover la cita');
    expect(classifyInbound('¿Dónde prestan el servicio?').kind).toBe('seguir');
  });
});

describe('storedDraftSend', () => {
  it('envía el borrador guardado y retiene una cita o un pago afirmados', () => {
    expect(storedDraftSend('4 horas por $88.000. ¿Para qué fecha la necesita?')).toBe('enviar');
    expect(storedDraftSend('La cita quedó confirmada para el lunes.')).toBe('retener');
    expect(storedDraftSend('Ya recibimos su pago. Gracias.')).toBe('retener');
  });
});

describe('reviewDisposition', () => {
  it('reescribe un borrador corregible y eleva el riesgo', () => {
    expect(reviewDisposition({
      verdict: 'devolver',
      feedback: 'Quite la temporada de diciembre.',
      draft: 'Se viene diciembre.',
      attempt: 1,
      maxRewrites: 1,
    })).toBe('reescribir');
    expect(reviewDisposition({
      verdict: 'devolver',
      feedback: 'Sigue inventando la temporada.',
      draft: 'Se viene diciembre.',
      attempt: 2,
      maxRewrites: 1,
    })).toBe('elevar');
    expect(reviewDisposition({
      verdict: 'riesgo',
      feedback: 'Confirmó un pago.',
      draft: 'Ya recibimos su pago.',
      attempt: 1,
      maxRewrites: 1,
    })).toBe('elevar');
    expect(reviewDisposition({
      verdict: 'aprobar',
      feedback: 'Cumple.',
      draft: '¿Para qué fecha la necesita?',
      attempt: 1,
      maxRewrites: 1,
    })).toBe('enviar');
    expect(reviewDisposition({
      verdict: 'aprobar',
      feedback: 'Cumple.',
      draft: 'La cita quedó confirmada.',
      attempt: 1,
      maxRewrites: 1,
    })).toBe('elevar');
    expect(reviewDisposition({
      verdict: 'riesgo',
      feedback: 'El revisor no respondió',
      draft: '¿Para qué fecha la necesita?',
      attempt: 1,
      maxRewrites: 1,
    })).toBe('saltar');
  });
});

describe('pickBooking', () => {
  it('toma un cupo de 4, 6 u 8 horas y no mueve una cita', () => {
    expect(pickBooking([
      { type: 'create_appointment', payload: { scheduledDate: '2026-11-23T19:00:00.000Z', duration: 240, wantsKit: false } },
    ])).toEqual({
      kind: 'crear',
      payload: { scheduledDate: '2026-11-23T19:00:00.000Z', duration: 240, wantsKit: false },
    });
    expect(pickBooking([
      { type: 'reschedule_appointment', payload: { appointmentId: 'a', scheduledDate: '2026-11-23T19:00:00.000Z' } },
      { type: 'create_appointment', payload: { scheduledDate: '2026-11-23T19:00:00.000Z', duration: 240 } },
    ]).kind).toBe('mover');
    expect(pickBooking([
      { type: 'create_appointment', payload: { scheduledDate: '2026-11-23T19:00:00.000Z', duration: 90 } },
    ]).kind).toBe('ninguna');
  });
});

describe('appointmentConfirmation', () => {
  it('confirma la visita y deja el pago pendiente', () => {
    const text = appointmentConfirmation('2026-11-20T19:00:00.000Z', 240);
    expect(text).toContain('4 horas');
    expect(text).toContain('14:00');
    expect(text).toContain('El pago queda pendiente de verificar.');
    expect(appointmentConfirmation('no-es-fecha', 240)).toBeNull();
  });

  it('no trata una pregunta como cita creada', () => {
    expect(claimsBooked('¿Le agendo el jueves?')).toBe(false);
    expect(claimsBooked('Ya quedó la cita para el lunes')).toBe(true);
  });
});

describe('staffNoticeCopy', () => {
  it('avisa con el nombre y sin un teléfono', () => {
    expect(noticeName('Ana 573001112233')).toBe('Ana');
    expect(staffNoticeCopy('573001112233', 'pidió una llamada').body).toBe('Sin nombre. pidió una llamada');
    expect(staffNoticeCopy('Casa Verde', 'sin cupo').body).not.toMatch(/\d{8,}/);
  });
});
