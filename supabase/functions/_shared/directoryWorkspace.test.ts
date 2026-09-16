import { assertEquals } from 'jsr:@std/assert';
import {
  cancellationReasonLabel,
  clampDirectoryOffset,
  clampDirectoryPageSize,
  derivePaymentDisplay,
  mapDirectoryWorkspaceCancellations,
  mapDirectoryWorkspacePage,
  mapDirectoryWorkspaceSnapshot,
  requireDirectoryId,
  resolveDirectoryWorkspaceAction,
  resolveDirectoryWorkspaceSegment,
  resolveDirectoryWorkspaceView,
} from './directoryWorkspace.ts';

Deno.test('resolves views and aliases from the shared contract', () => {
  assertEquals(resolveDirectoryWorkspaceView('scheduled'), 'scheduled');
  assertEquals(resolveDirectoryWorkspaceView('directorio'), 'all');
  assertEquals(resolveDirectoryWorkspaceView('cancelados'), 'canceled');
  assertEquals(resolveDirectoryWorkspaceView('unknown'), 'all');
  assertEquals(resolveDirectoryWorkspaceAction('page'), 'page');
  assertEquals(resolveDirectoryWorkspaceAction('nope'), 'summary');
  assertEquals(resolveDirectoryWorkspaceSegment('reactivation'), 'reactivation');
  assertEquals(resolveDirectoryWorkspaceSegment('favorites'), null);
});

Deno.test('clamps page size and offset to the server contract', () => {
  assertEquals(clampDirectoryPageSize(500), 100);
  assertEquals(clampDirectoryPageSize(-2), 1);
  assertEquals(clampDirectoryOffset(-8), 0);
});

Deno.test('maps snapshot KPI names without inventing extra segments', () => {
  assertEquals(
    mapDirectoryWorkspaceSnapshot({
      total: 10,
      scheduled: 7,
      canceledOrRejected: 3,
      recurring: 2,
      reactivation: 1,
    }),
    {
      total: 10,
      scheduled: 7,
      canceledOrRejected: 3,
      recurring: 2,
      reactivation: 1,
    },
  );
});

Deno.test('maps page rows and computes hasMore from matched_count', () => {
  const page = mapDirectoryWorkspacePage([
    {
      id: '41000000-0000-4000-8000-000000000003',
      full_name: 'Lucia Cancelo',
      last_completed_payment_status: 'PAGO_EN_PROCESO',
      computed_debt: 25000,
      matched_count: 3,
    },
  ], 1, 0);
  assertEquals(page.items[0]?.id, '41000000-0000-4000-8000-000000000003');
  assertEquals(page.matchedCount, 3);
  assertEquals(page.hasMore, true);
  assertEquals(page.nextOffset, 1);
  assertEquals(derivePaymentDisplay(page.items[0]?.lastCompletedPaymentStatus), 'EN_PROCESO');
});

Deno.test('requires a directory id for cancellation history', () => {
  let failed = false;
  try {
    requireDirectoryId('   ');
  } catch (error) {
    failed = error instanceof Error && error.message === 'directoryId es obligatorio.';
  }
  assertEquals(failed, true);
  assertEquals(requireDirectoryId('41000000-0000-4000-8000-000000000003'), '41000000-0000-4000-8000-000000000003');
});

Deno.test('keeps every cancellation incident and labels known reasons', () => {
  const incidents = mapDirectoryWorkspaceCancellations([
    {
      appointment_id: 'apt-new',
      status: 'REJECTED',
      cancellation_reason: 'no_confirmo',
    },
    {
      appointment_id: 'apt-old',
      status: 'CANCELED',
      cancellation_reason: 'cliente_viaja_aplaza',
      cancellation_reason_other: 'Se va de viaje',
    },
  ]);
  assertEquals(incidents.length, 2);
  assertEquals(cancellationReasonLabel(incidents[1]?.reason), 'El cliente viaja o aplaza');
  assertEquals(cancellationReasonLabel(null), 'Sin motivo especificado');
});
