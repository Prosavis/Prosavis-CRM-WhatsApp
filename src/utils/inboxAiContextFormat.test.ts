import { describe, expect, it } from 'vitest';
import {
  INBOX_AI_SYSTEM_INSTRUCTION,
  buildPropertyLocationSummary,
  formatBogotaDateTime,
  formatInboxAiContextBlock,
  groundBookingClientInfo,
  groundBookingPayment,
  mapInboxAiAppointmentPayment,
  normalizeAddressKey,
} from '../../supabase/functions/_shared/inboxAiContextFormat';

describe('normalizeAddressKey / buildPropertyLocationSummary', () => {
  it('treats minor address variants as the same property', () => {
    const a = normalizeAddressKey('Calle 1 #2-3 Apto 401');
    const b = normalizeAddressKey('calle 1 2 3, apartamento 401');
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it('detects single property pattern with counts and date range', () => {
    const summary = buildPropertyLocationSummary({
      appointments: [
        {
          id: '1',
          scheduledDate: '2026-07-01T14:00:00.000Z',
          address: 'Calle 10 #20-30',
          addressReference: 'Apto 201',
        },
        {
          id: '2',
          scheduledDate: '2026-08-01T14:00:00.000Z',
          address: 'Calle 10 #20-30',
          addressReference: 'Apto 201',
        },
      ],
      preferredDirectoryAddress: 'Calle 10 #20-30',
    });
    expect(summary.pattern).toBe('single');
    expect(summary.uniquePropertyCount).toBe(1);
    expect(summary.properties[0]?.appointmentCount).toBe(2);
    expect(summary.patternLabel).toContain('misma propiedad');
    expect(summary.preferredDirectoryAddress).toBe('Calle 10 #20-30');
  });

  it('detects multiple properties', () => {
    const summary = buildPropertyLocationSummary({
      appointments: [
        {
          id: '1',
          scheduledDate: '2026-07-01T14:00:00.000Z',
          address: 'Calle 10 #20-30',
        },
        {
          id: '2',
          scheduledDate: '2026-08-01T14:00:00.000Z',
          address: 'Carrera 5 #8-12',
        },
      ],
    });
    expect(summary.pattern).toBe('multiple');
    expect(summary.uniquePropertyCount).toBe(2);
    expect(summary.patternLabel).toContain('2 propiedades');
  });
});

describe('formatInboxAiContextBlock', () => {
  it('includes property summary, addresses, appointment count and current time', () => {
    const block = formatInboxAiContextBlock({
      phone: '573001112233',
      transcript: '[01/08/2026, 05:00] Cliente: Hola\n[01/08/2026, 06:00] Agente: Buenas',
      historyMeta: {
        loaded: 2,
        truncated: false,
        oldestAt: '2026-08-01T10:00:00Z',
        newestAt: '2026-08-01T11:00:00Z',
      },
      conversationTags: ['Bogotá', 'Favoritos'],
      directory: {
        fullName: 'Ana Pérez',
        city: 'Bogotá',
        tags: ['Cliente'],
        appUserId: 'uid-1',
        notesSummary: 'Prefiere mañana',
        paymentStatus: 'paid',
        isReturningClient: true,
        preferredServiceAddress: 'Calle 10 #20-30',
      },
      appointments: [
        {
          id: 'a1',
          scheduledDate: '2026-08-10T14:00:00.000Z',
          status: 'CONFIRMED',
          serviceName: 'Limpieza',
          address: 'Calle 10 #20-30',
          addressReference: 'Apto 201',
          duration: 4,
          clientName: 'Ana Pérez',
          providerName: 'Laura Gómez',
          paymentStatus: 'PAGO_ACEPTADO',
          totalAmount: 88_000,
          paymentMethod: 'WOMPI',
          wompiReference: 'APPT-123',
        },
        {
          id: 'a0',
          scheduledDate: '2026-07-01T14:00:00.000Z',
          status: 'COMPLETED',
          serviceName: 'Limpieza',
          address: 'Calle 10 #20-30',
          addressReference: 'Apto 201',
          duration: 3,
          clientName: 'Ana Pérez',
          providerName: 'María López',
        },
      ],
      appointmentCount: 7,
      sessionWindow: {
        status: 'open',
        lastInboundAt: '2026-08-05T11:00:00.000Z',
        expiresAt: '2026-08-06T11:00:00.000Z',
        requiresTemplate: false,
      },
      nowIso: '2026-08-05T12:00:00.000Z',
    });

    expect(block).toContain('=== Momento actual ===');
    expect(block).toContain(formatBogotaDateTime('2026-08-05T12:00:00.000Z'));
    expect(block).toContain('Total apoyos/citas encontrados (ventana CRM): 7');
    expect(block).toContain('=== Propiedades / ubicaciones de apoyos ===');
    expect(block).toContain('misma propiedad');
    expect(block).toContain('Dirección preferida (directorio): Calle 10 #20-30');
    expect(block).toContain('Estado de pago (directorio): paid');
    expect(block).toContain('=== Canal / ventana WhatsApp ===');
    expect(block).toContain('Estado: open');
    expect(block).toContain('Requiere plantilla: no');
    expect(block).toContain('dirección: Calle 10 #20-30 (Apto 201)');
    expect(block).toContain('auxiliar: Laura Gómez');
    expect(block).toContain('pago: PAGO_ACEPTADO');
    expect(block).toContain('valor: COP 88.000');
    expect(block).toContain('método: WOMPI');
    expect(block).toContain('referencia Wompi: APPT-123');
    expect(block).toContain('Cliente: Hola');
    expect(block).toContain('=== Catálogo oficial de precios (fuente de verdad) ===');
    expect(block).toContain('120 minutos → COP 58.000');
    expect(block).toContain('Kit profesional → COP 30.000 adicionales');
  });

  it('degrades gracefully without directory or appointments', () => {
    const block = formatInboxAiContextBlock({
      phone: '573009998877',
      transcript: 'Cliente: info',
      historyMeta: { loaded: 1, truncated: true },
      conversationTags: [],
      directory: null,
      appointments: [],
      appointmentCount: 0,
      sessionWindow: {
        status: 'unknown',
        lastInboundAt: null,
        expiresAt: null,
        requiresTemplate: true,
      },
      nowIso: '2026-08-05T12:00:00.000Z',
    });
    expect(block).toContain('Sin entrada en crm_directory');
    expect(block).toContain('Sin citas/apoyos encontrados');
    expect(block).toContain('Total apoyos/citas encontrados (ventana CRM): 0');
    expect(block).toContain('=== Propiedades / ubicaciones de apoyos ===');
    expect(block).toContain('=== Canal / ventana WhatsApp ===');
    expect(block).toContain('Estado: unknown');
    expect(block).toContain('Ventana truncada');
  });
});

describe('INBOX_AI_SYSTEM_INSTRUCTION', () => {
  it('requires early arrival when house will be empty', () => {
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/SEGURIDAD Y ACCESO/);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/1 hora antes/);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/NUNCA propongas llegar exactamente/);
  });

  it('requires grounded prices, payments, availability and Meta templates', () => {
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/precios.+catálogo oficial/i);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/pago.+datos autoritativos/i);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/nunca inventes.+horarios disponibles/i);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/ventana.+cerrada.+plantilla/i);
  });
});

describe('groundBookingClientInfo', () => {
  it('grounds address from preferred / single property', () => {
    const grounded = groundBookingClientInfo(
      {
        stage: 'collecting',
        clientInfo: {
          name: 'Inventado',
          phone: '000',
          email: null,
          address: null,
          city: null,
          isReturningClient: false,
          userId: null,
        },
      },
      {
        phone: '573001112233',
        directory: {
          fullName: 'Real Name',
          email: 'a@b.com',
          address: 'Calle contacto',
          preferredServiceAddress: 'Calle servicio 9',
          city: 'Medellín',
          appUserId: 'uid-9',
          isReturningClient: true,
        },
        propertySummary: {
          uniquePropertyCount: 1,
          pattern: 'single',
          patternLabel: 'Siempre en la misma propiedad',
          properties: [
            {
              address: 'Calle servicio 9',
              appointmentCount: 3,
            },
          ],
          appointmentsWithoutAddress: 0,
        },
      },
    );

    expect(grounded.clientInfo?.address).toBe('Calle servicio 9');
    expect(grounded.clientInfo?.name).toBe('Real Name');
  });
});

describe('groundBookingPayment', () => {
  it('overwrites invented payment values from the closest relevant upcoming appointment', () => {
    const grounded = groundBookingPayment(
      {
        paymentStatus: 'PENDING',
        paymentAmount: 999_999,
      },
      {
        appointments: [
          {
            id: 'later',
            scheduledDate: '2026-08-20T14:00:00.000Z',
            paymentStatus: 'PAGO_PENDIENTE',
            totalAmount: 118_000,
          },
          {
            id: 'closest',
            scheduledDate: '2026-08-10T14:00:00.000Z',
            paymentStatus: 'PAGO_ACEPTADO',
            totalAmount: 88_000,
          },
        ],
      },
      '2026-08-05T12:00:00.000Z',
    );

    expect(grounded.paymentStatus).toBe('APPROVED');
    expect(grounded.paymentAmount).toBe(88_000);
  });

  it('clears invented paid claims when no upcoming appointment has authoritative payment data', () => {
    const grounded = groundBookingPayment(
      {
        paymentStatus: 'APPROVED',
        paymentAmount: 999_999,
      },
      {
        appointments: [
          {
            id: 'without-payment',
            scheduledDate: '2026-08-10T14:00:00.000Z',
          },
        ],
      },
      '2026-08-05T12:00:00.000Z',
    );

    expect(grounded.paymentStatus).toBe('none');
    expect(grounded.paymentAmount).toBeNull();
  });
});

describe('mapInboxAiAppointmentPayment', () => {
  it('maps Firestore payment fields without trusting incompatible values', () => {
    expect(
      mapInboxAiAppointmentPayment({
        paymentStatus: 'PAGO_ACEPTADO',
        totalAmount: '88000',
        paymentMethod: 'WOMPI',
        wompiReference: 'APPT-123',
      }),
    ).toEqual({
      paymentStatus: 'PAGO_ACEPTADO',
      totalAmount: 88_000,
      paymentMethod: 'WOMPI',
      wompiReference: 'APPT-123',
    });
  });
});
