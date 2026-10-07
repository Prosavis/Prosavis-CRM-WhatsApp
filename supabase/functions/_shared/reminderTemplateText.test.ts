import { assertEquals } from 'jsr:@std/assert';
import {
  clientReminderParameterTexts,
  clientReminderPreview,
  formatClientDuration,
  formatTeamDurationLabel,
  professionalReminderParameterTexts,
  teamClockFromRecord,
} from './reminderTemplateText.ts';

const LINA = {
  assignedTeamMemberIds: ['johanna', 'isabel'],
  assignedTeamMemberDurationsMinutes: [480, 480],
  duration: 960,
};

Deno.test('dos auxiliares a la misma hora: jornada 8 h, equipo 16 h', () => {
  const clock = teamClockFromRecord(LINA);
  assertEquals(clock.wallClockMinutes, 480);
  assertEquals(clock.teamDurationMinutes, 960);
  assertEquals(clock.teamSize, 2);
  assertEquals(
    formatTeamDurationLabel(clock),
    '16 horas de equipo (2 auxiliares x 8 horas)',
  );
});

Deno.test('dos auxiliares desfasadas: del primer inicio al último fin', () => {
  const clock = teamClockFromRecord({
    assignedTeamMemberIds: ['a', 'b'],
    assignedTeamMemberDurationsMinutes: [240, 120],
    assignedTeamMemberStartOffsetsMinutes: [0, 120],
    duration: 360,
  });
  assertEquals(clock.wallClockMinutes, 240);
  assertEquals(clock.teamDurationMinutes, 360);
});

Deno.test('una auxiliar no agrega conteo', () => {
  assertEquals(formatClientDuration(480, 1), '8 horas');
  assertEquals(formatClientDuration(480), '8 horas');
});

Deno.test('la plantilla de la clienta nombra a las dos y no dice 16 horas', () => {
  const texts = clientReminderParameterTexts({
    clientName: 'Lina María Alvarez',
    professionalName: 'Johanna Guerra y Isabel Partidas',
    scheduledDate: '2026-10-07T13:00:00.000Z',
    address: 'Cra 21 #35-68, Dosquebradas',
    durationMinutes: 480,
    teamSize: 2,
    totalAmount: 336000,
    paymentStatus: 'PAGO_PENDIENTE',
    paidAmount: 0,
    pendingAmount: 336000,
  });
  assertEquals(texts.length, 7);
  assertEquals(texts[1], 'Johanna Guerra y Isabel Partidas');
  assertEquals(texts[4], '8 horas (2 auxiliares)');
  const preview = clientReminderPreview({
    clientName: 'Lina María Alvarez',
    professionalName: 'Johanna Guerra y Isabel Partidas',
    scheduledDate: '2026-10-07T13:00:00.000Z',
    address: 'Cra 21 #35-68, Dosquebradas',
    durationMinutes: 480,
    teamSize: 2,
    totalAmount: 336000,
    paymentStatus: 'PAGO_PENDIENTE',
  });
  assertEquals(preview.includes('Tu profesional: Johanna Guerra y Isabel Partidas'), true);
  assertEquals(preview.includes('Duración: 8 horas (2 auxiliares)'), true);
  assertEquals(preview.includes('16 horas'), false);
  assertEquals(preview.includes('Responde PARAR'), true);
});

Deno.test('el recordatorio de la auxiliar muestra solo sus horas', () => {
  const texts = professionalReminderParameterTexts({
    clientName: 'Lina María Alvarez',
    professionalName: 'Johanna Guerra',
    scheduledDate: '2026-10-07T13:00:00.000Z',
    address: 'Cra 21 #35-68',
    durationMinutes: 480,
    teamSize: 2,
  });
  assertEquals(texts[3], '8 horas');
  assertEquals(texts[3].includes('auxiliares'), false);
});
