import { describe, expect, it } from 'vitest';
import {
  INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET,
  INBOX_AI_SYSTEM_INSTRUCTION,
  SECTION_CHAR_BUDGETS,
  buildPropertyLocationSummary,
  formatBogotaDateTime,
  formatInboxAiContextBlock,
  getSectionCharBudget,
  groundBookingClientInfo,
  groundBookingPayment,
  mapInboxAiAppointmentPayment,
  normalizeAddressKey,
  type InboxAiSectionHeading,
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
  it('rejects an unbudgeted section heading instead of formatting it silently', () => {
    expect(() => getSectionCharBudget('=== Sección sin presupuesto ===')).toThrow(
      /heading sin presupuesto/i,
    );
  });

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
      memory: {
        stableKey: '573001112233',
        summary: 'Cliente recurrente que prefiere horario de tarde.',
        preferences: ['Horario de tarde'],
        objections: ['Cuida el presupuesto'],
        agreements: ['Confirmar disponibilidad el viernes'],
        lastSummarizedMessageAt: '2026-08-01T11:00:00.000Z',
        messageCount: 42,
        model: 'gemini-3.6-flash',
        updatedAt: '2026-08-01T11:01:00.000Z',
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
    expect(block).toContain('=== Memoria del cliente ===');
    expect(block).toContain('Resumen: Cliente recurrente que prefiere horario de tarde.');
    expect(block).toContain('Preferencias: Horario de tarde');
    expect(block).toContain('Objeciones: Cuida el presupuesto');
    expect(block).toContain('Acuerdos: Confirmar disponibilidad el viernes');
    expect(block).toContain('Marcador: 2026-08-01T11:00:00.000Z');
    expect(block).toContain('Modelo: gemini-3.6-flash');
    expect(block.indexOf('=== Canal / ventana WhatsApp ===')).toBeLessThan(
      block.indexOf('=== Memoria del cliente ==='),
    );
    expect(block.indexOf('=== Memoria del cliente ===')).toBeLessThan(
      block.indexOf('=== Perfil directorio ==='),
    );
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
    expect(block).toContain('4 horas (240 min) → COP 88.000');
    expect(block).toContain('6 horas (360 min) → COP 118.000');
    expect(block).toContain('8 horas (480 min) → COP 148.000');
    expect(block).toContain('3+ habitaciones');
    expect(block).not.toContain('120 minutos → COP 58.000');
    expect(block).not.toContain('180 minutos → COP 78.000');
    expect(block).toContain('Kit profesional → COP 30.000 adicionales');
    expect(block).toContain('=== Cobertura oficial de servicios (fuente de verdad) ===');
    expect(block).toContain('Cra. 23 #85-13 Manzana 5 Casa 17, Pereira, Risaralda');
    expect(block).toContain('Pereira — cobertura directa');
    expect(block).toContain('Dosquebradas — cobertura directa');
    expect(block).toContain('Cerritos — cobertura directa');
    expect(block).toContain('Santa Rosa de Cabal');
    expect(block).not.toContain('Nombre para saludar:');
  });

  it('includes the canonical greeting name and forbids using other transcript names', () => {
    const block = formatInboxAiContextBlock({
      phone: '573150004639',
      transcript: 'Cliente: 22 de agosto Julieth Duque',
      historyMeta: { loaded: 1, truncated: false },
      memory: null,
      directory: {
        fullName: 'Marii Duque✨',
        isReturningClient: false,
      },
      appointments: [],
      sessionWindow: {
        status: 'open',
        lastInboundAt: null,
        expiresAt: null,
        requiresTemplate: false,
      },
      nowIso: '2026-08-21T19:58:00.000Z',
      canonicalName: 'Marii Duque✨',
      greetingFirstName: 'Marii',
    });
    expect(block).toContain('Nombre canónico: Marii Duque✨');
    expect(block).toContain('Nombre para saludar: Marii');
    expect(block).toMatch(/no lo uses para saludar/i);
  });

  it('flags a live service and a failed appointment load', () => {
    const block = formatInboxAiContextBlock({
      phone: '573150004639',
      transcript: 'Cliente: hola',
      historyMeta: { loaded: 1, truncated: false },
      memory: null,
      directory: { fullName: 'Marii Duque✨', isReturningClient: true },
      appointments: [{
        id: 'a1',
        scheduledDate: '2026-08-21T19:00:00.000Z',
        status: 'IN_PROGRESS',
        serviceName: 'Prosavis Limpieza',
        address: 'Parque Jardín',
        clientName: 'Marii Duque✨',
        providerName: 'Diana Lucía Ramirez Vallejo',
        paymentStatus: 'PAGO_PENDIENTE',
      }],
      appointmentCount: 1,
      sessionWindow: {
        status: 'open',
        lastInboundAt: null,
        expiresAt: null,
        requiresTemplate: false,
      },
      nowIso: '2026-08-21T19:58:00.000Z',
    });
    expect(block).toContain('Apoyo en curso ahora:');
    expect(block).toContain('IN_PROGRESS');
    expect(block).toContain('Diana Lucía Ramirez Vallejo');

    const failed = formatInboxAiContextBlock({
      phone: '573150004639',
      transcript: 'Cliente: hola',
      historyMeta: { loaded: 1, truncated: false },
      memory: null,
      directory: null,
      appointments: [],
      appointmentCount: 0,
      appointmentsLoadFailed: true,
      sessionWindow: {
        status: 'unknown',
        lastInboundAt: null,
        expiresAt: null,
        requiresTemplate: true,
      },
      nowIso: '2026-08-21T19:58:00.000Z',
    });
    expect(failed).toContain('No se pudieron cargar las citas de Firestore');
    expect(failed).not.toContain('Sin citas/apoyos encontrados para este contacto.');
  });

  it('degrades gracefully without directory or appointments', () => {
    const block = formatInboxAiContextBlock({
      phone: '573009998877',
      transcript: 'Cliente: info',
      historyMeta: { loaded: 1, truncated: true },
      memory: null,
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
    expect(block).toContain('=== Memoria del cliente ===');
    expect(block).toContain('Sin memoria persistida todavía.');
    expect(block).toContain('Estado: unknown');
    expect(block).toContain('Ventana truncada');
  });

  it('omits zero and negative appointment totals from formatted context', () => {
    const block = formatInboxAiContextBlock({
      phone: '573009998877',
      transcript: 'Cliente: info',
      historyMeta: { loaded: 1, truncated: false },
      memory: null,
      conversationTags: [],
      directory: null,
      appointments: [
        {
          id: 'zero-total',
          scheduledDate: '2026-08-10T14:00:00.000Z',
          totalAmount: 0,
        },
        {
          id: 'negative-total',
          scheduledDate: '2026-08-11T14:00:00.000Z',
          totalAmount: -88_000,
        },
      ],
      sessionWindow: {
        status: 'unknown',
        lastInboundAt: null,
        expiresAt: null,
        requiresTemplate: true,
      },
      nowIso: '2026-08-05T12:00:00.000Z',
    });

    expect(block).not.toContain('valor: COP 0');
    expect(block).not.toContain('valor: COP -88.000');
  });

  it('formats operational conversation, CRM classification and official house answers', () => {
    const block = formatInboxAiContextBlock({
      phone: '573009998877',
      transcript: 'Cliente: Necesito información',
      historyMeta: { loaded: 1, truncated: false },
      memory: null,
      conversationContext: {
        tags: ['Bogotá'],
        adminNotes: 'Cliente prefiere contacto por WhatsApp',
        assignedTo: 'agent-7',
        lastIntent: 'pricing',
        automatedInboundDisabled: true,
      },
      directory: {
        id: 'directory-1',
        fullName: 'Ana',
        source: 'whatsapp',
        serviceId: 'cleaning',
        classification: 'client',
        paymentStatus: 'pending',
        optOut: true,
        isReturningClient: true,
      },
      officialAnswers: {
        snippets: [{
          shortcut: '/precio',
          label: 'Precio base',
          body: 'Nuestro apoyo mínimo es de dos horas.',
        }],
        faqs: [{
          question: '¿Dónde tienen cobertura?',
          answer: 'Tenemos cobertura en Bogotá y Medellín.',
          category: 'cobertura',
          keywords: ['ciudades', 'zonas'],
        }],
      },
      appointments: [],
      sessionWindow: {
        status: 'open',
        lastInboundAt: null,
        expiresAt: null,
        requiresTemplate: false,
      },
      nowIso: '2026-08-05T12:00:00.000Z',
    });

    expect(block).toContain('=== Contexto operativo de conversación ===');
    expect(block).toContain('Notas administrativas: Cliente prefiere contacto por WhatsApp');
    expect(block).toContain('Automatización inbound deshabilitada: sí');
    expect(block).toContain('=== Clasificación CRM ===');
    expect(block).toContain('Fuente: whatsapp');
    expect(block).toContain('Servicio: cleaning');
    expect(block).toContain('Clasificación: client');
    expect(block).toContain('Opt-out: sí');
    expect(block).toContain('=== Respuestas oficiales de la casa ===');
    expect(block).toContain('/precio | Precio base');
    expect(block).toContain('¿Dónde tienen cobertura?');
    expect(block).toMatch(/reutiliza.+redacción oficial.+antes de improvisar/i);
    expect(block).toContain('=== Cobertura oficial de servicios (fuente de verdad) ===');
    expect(block).toContain('Pereira — cobertura directa');
    expect(block.indexOf('=== Cobertura oficial de servicios (fuente de verdad) ==='))
      .toBeLessThan(block.indexOf('=== Respuestas oficiales de la casa ==='));
  });

  it('clips every section independently and keeps the complete block within its ceiling', () => {
    expect(INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET).toBe(78_000);
    const huge = 'x'.repeat(100_000);
    const latestTranscriptMarker = 'ÚLTIMO MENSAJE';
    const block = formatInboxAiContextBlock({
      phone: '573009998877',
      transcript:
        `${'h'.repeat(60_000 - latestTranscriptMarker.length)}${latestTranscriptMarker}`,
      historyMeta: {
        loaded: 150,
        truncated: true,
        oldestAt: '2026-01-01T00:00:00.000Z',
        newestAt: '2026-08-05T12:00:00.000Z',
      },
      memory: {
        stableKey: '573009998877',
        summary: huge,
        preferences: [huge],
        objections: [huge],
        agreements: [huge],
        lastSummarizedMessageAt: '2026-08-05T12:00:00.000Z',
        messageCount: 150,
        model: 'gemini-3.6-flash',
        updatedAt: '2026-08-05T12:01:00.000Z',
      },
      conversationContext: {
        tags: Array.from({ length: 100 }, (_, index) => `tag-${index}-${huge}`),
        adminNotes: huge,
        assignedTo: huge,
        lastIntent: huge,
        automatedInboundDisabled: false,
      },
      directory: {
        fullName: huge,
        notesSummary: huge,
        source: huge,
        serviceId: huge,
        classification: huge,
        paymentStatus: huge,
        tags: Array.from({ length: 100 }, (_, index) => `dir-${index}-${huge}`),
        optOut: false,
        isReturningClient: true,
      },
      officialAnswers: {
        snippets: Array.from({ length: 30 }, (_, index) => ({
          shortcut: `/s${index}`,
          label: huge,
          body: huge,
        })),
        faqs: Array.from({ length: 30 }, () => ({
          question: huge,
          answer: huge,
          category: huge,
          keywords: [huge],
        })),
      },
      appointments: Array.from({ length: 10 }, (_, index) => ({
        id: String(index),
        scheduledDate: `2026-08-${String(index + 10).padStart(2, '0')}T14:00:00.000Z`,
        serviceName: huge,
        address: huge,
        clientName: huge,
        providerName: huge,
      })),
      sessionWindow: {
        status: 'open',
        lastInboundAt: null,
        expiresAt: null,
        requiresTemplate: false,
      },
      nowIso: '2026-08-05T12:00:00.000Z',
    });

    const headings = Object.keys(SECTION_CHAR_BUDGETS) as InboxAiSectionHeading[];
    for (const [index, heading] of headings.entries()) {
      const start = block.indexOf(heading);
      expect(start, heading).toBeGreaterThanOrEqual(0);
      const nextStarts = headings
        .slice(index + 1)
        .map((nextHeading) => block.indexOf(nextHeading, start + heading.length))
        .filter((position) => position >= 0);
      const end = nextStarts.length ? Math.min(...nextStarts) : block.length;
      expect(block.slice(start, end).trimEnd().length, heading)
        .toBeLessThanOrEqual(SECTION_CHAR_BUDGETS[heading]);
    }
    expect(block).toContain('[Sección truncada por presupuesto]');
    expect(block).toContain('ÚLTIMO MENSAJE');
    expect(block.length).toBeLessThanOrEqual(INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET);
    expect(SECTION_CHAR_BUDGETS['=== Memoria del cliente ===']).toBe(3_000);
    expect(SECTION_CHAR_BUDGETS['=== Historial WhatsApp ===']).toBe(57_500);
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
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/únicamente 4, 6 u 8 horas/i);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(
      /respuesta oficial contradice ese catálogo.+ignórala/i,
    );
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/pago.+datos autoritativos/i);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/nunca inventes.+horarios disponibles/i);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toContain(
      '=== Disponibilidad real (próximos días) ===',
    );
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(
      /prefiere.+hora real.+llegada anticipada/i,
    );
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/ventana.+cerrada.+plantilla/i);
  });

  it('prefers official house answers before improvising', () => {
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(
      /respuestas oficiales de la casa.+antes de improvisar/i,
    );
  });

  it('grounds geographic coverage and forbids inventing Bogotá or other cities', () => {
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toContain(
      '=== Cobertura oficial de servicios (fuente de verdad) ===',
    );
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/nunca afirmes.+Bogotá/i);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(
      /respuesta oficial contradice esa cobertura.+ignórala/i,
    );
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(
      /dónde están ubicados.+sede oficial de Pereira/i,
    );
  });

  it('treats audio transcriptions as the client message and forbids claiming it was inaudible', () => {
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/\[Audio transcrito\]/);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/nunca digas que no pudiste escuchar/i);
  });

  it('requires greeting with the canonical inbox name only', () => {
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(/Nombre para saludar/i);
    expect(INBOX_AI_SYSTEM_INSTRUCTION).toMatch(
      /No uses otros nombres de la memoria ni del historial para saludar/i,
    );
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

  it('does not borrow payment data from a later appointment', () => {
    const grounded = groundBookingPayment(
      {
        paymentStatus: 'APPROVED',
        paymentAmount: 999_999,
      },
      {
        appointments: [
          {
            id: 'closest-without-payment',
            scheduledDate: '2026-08-10T14:00:00.000Z',
          },
          {
            id: 'later-paid',
            scheduledDate: '2026-08-20T14:00:00.000Z',
            paymentStatus: 'PAGO_ACEPTADO',
            totalAmount: 118_000,
          },
        ],
      },
      '2026-08-05T12:00:00.000Z',
    );

    expect(grounded.paymentStatus).toBe('none');
    expect(grounded.paymentAmount).toBeNull();
  });

  it('grounds payment from the appointment matching the booking target', () => {
    const grounded = groundBookingPayment(
      {
        collectedData: {
          date: '2026-08-20',
          time: '09:00',
          address: 'Carrera 5 #8-12',
        },
        paymentStatus: 'APPROVED',
        paymentAmount: 999_999,
      },
      {
        appointments: [
          {
            id: 'closer-different-booking',
            scheduledDate: '2026-08-10T14:00:00.000Z',
            address: 'Calle 10 #20-30',
            paymentStatus: 'PAGO_ACEPTADO',
            totalAmount: 88_000,
          },
          {
            id: 'conversation-target',
            scheduledDate: '2026-08-20T14:00:00.000Z',
            address: 'Carrera 5 #8-12',
            paymentStatus: 'PAGO_PENDIENTE',
            totalAmount: 118_000,
          },
        ],
      },
      '2026-08-05T12:00:00.000Z',
    );

    expect(grounded.paymentStatus).toBe('PENDING');
    expect(grounded.paymentAmount).toBe(118_000);
  });

  it('clears invented payment when no authoritative appointment matches an explicit target', () => {
    const grounded = groundBookingPayment(
      {
        collectedData: {
          date: '2026-08-15',
          time: '09:00',
          address: 'Calle objetivo #1-2',
        },
        paymentStatus: 'APPROVED',
        paymentAmount: 999_999,
      },
      {
        appointments: [
          {
            id: 'different-booking',
            scheduledDate: '2026-08-10T14:00:00.000Z',
            address: 'Otra dirección #3-4',
            paymentStatus: 'PAGO_ACEPTADO',
            totalAmount: 88_000,
          },
        ],
      },
      '2026-08-05T12:00:00.000Z',
    );

    expect(grounded.paymentStatus).toBe('none');
    expect(grounded.paymentAmount).toBeNull();
  });

  it('does not borrow payment from a later match for a partial target', () => {
    const grounded = groundBookingPayment(
      {
        collectedData: {
          date: '2026-08-10',
        },
        paymentStatus: 'APPROVED',
        paymentAmount: 999_999,
      },
      {
        appointments: [
          {
            id: 'nearest-matching-unpaid',
            scheduledDate: '2026-08-10T14:00:00.000Z',
          },
          {
            id: 'later-matching-paid',
            scheduledDate: '2026-08-10T18:00:00.000Z',
            paymentStatus: 'PAGO_ACEPTADO',
            totalAmount: 118_000,
          },
        ],
      },
      '2026-08-05T12:00:00.000Z',
    );

    expect(grounded.paymentStatus).toBe('none');
    expect(grounded.paymentAmount).toBeNull();
  });

  it('never treats zero or negative appointment totals as authoritative amounts', () => {
    const zero = groundBookingPayment(
      { paymentStatus: 'APPROVED', paymentAmount: 999_999 },
      {
        appointments: [
          {
            id: 'zero',
            scheduledDate: '2026-08-10T14:00:00.000Z',
            paymentStatus: 'PAGO_ACEPTADO',
            totalAmount: 0,
          },
        ],
      },
      '2026-08-05T12:00:00.000Z',
    );
    const negative = groundBookingPayment(
      { paymentStatus: 'PENDING', paymentAmount: 999_999 },
      {
        appointments: [
          {
            id: 'negative',
            scheduledDate: '2026-08-10T14:00:00.000Z',
            paymentStatus: 'PAGO_PENDIENTE',
            totalAmount: -88_000,
          },
        ],
      },
      '2026-08-05T12:00:00.000Z',
    );

    expect(zero.paymentStatus).toBe('APPROVED');
    expect(zero.paymentAmount).toBeNull();
    expect(negative.paymentStatus).toBe('PENDING');
    expect(negative.paymentAmount).toBeNull();
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
