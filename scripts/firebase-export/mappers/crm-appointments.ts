import { iterateCollectionOrdered } from '../lib/firestore-reader.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

function jsonOrNull(value: unknown): Record<string, unknown> | unknown[] | null {
  if (value == null) return null;
  if (typeof value === 'object') return value as Record<string, unknown> | unknown[];
  return null;
}

export async function migrateAppointments(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const rows: Record<string, unknown>[] = [];
  let attempted = 0;
  const errors: string[] = [];
  let upserted = 0;

  for await (const batch of iterateCollectionOrdered(
    'appointments',
    'updatedAt',
    500,
    options.since
  )) {
    for (const doc of batch) {
      attempted += 1;
      const data = doc.data();

      rows.push({
        id: doc.id,
        service_id: data.serviceId ?? '',
        service_title: data.serviceTitle ?? '',
        provider_id: data.providerId ?? null,
        team_member_id: data.teamMemberId ?? null,
        provider_name: data.providerName ?? '',
        client_id: data.clientId ?? '',
        client_name: data.clientName ?? '',
        client_phone: data.clientPhone ?? null,
        client_app_user_id: data.clientAppUserId ?? null,
        status: data.status ?? 'pending',
        scheduled_date:
          firestoreTimestampToIso(data.scheduledDate) ?? new Date().toISOString(),
        duration: data.duration ?? 60,
        location: jsonOrNull(data.location),
        service_address: jsonOrNull(data.serviceAddress),
        notes: data.notes ?? null,
        client_notes: data.clientNotes ?? null,
        price: data.price ?? 0,
        total_amount: data.totalAmount ?? null,
        previous_scheduled_date: firestoreTimestampToIso(data.previousScheduledDate),
        original_scheduled_date: firestoreTimestampToIso(data.originalScheduledDate),
        proposed_scheduled_date: firestoreTimestampToIso(data.proposedScheduledDate),
        rescheduled_by: data.rescheduledBy ?? null,
        reschedule_requested_by: data.rescheduleRequestedBy ?? null,
        rescheduled_at: firestoreTimestampToIso(data.rescheduledAt),
        rescheduled_reason: data.rescheduledReason ?? null,
        reschedule_request: jsonOrNull(data.rescheduleRequest),
        booking_snapshot: jsonOrNull(data.bookingSnapshot),
        status_history: Array.isArray(data.statusHistory) ? data.statusHistory : [],
        last_notified_at: firestoreTimestampToIso(data.lastNotifiedAt),
        security_pin: data.securityPin ?? null,
        otp_required: data.otpRequired ?? null,
        rejection_reason: data.rejectionReason ?? null,
        requires_admin_assignment: data.requiresAdminAssignment === true,
        rejected_by: Array.isArray(data.rejectedBy) ? data.rejectedBy : [],
        reminder_task_id: data.reminderTaskId ?? null,
        completion_reminder_task_id: data.completionReminderTaskId ?? null,
        review_request_task_id: data.reviewRequestTaskId ?? null,
        cleaning_instructions: data.cleaningInstructions ?? null,
        access_instructions: data.accessInstructions ?? null,
        google_event_id: data.googleEventId ?? null,
        google_event_id_admin: data.googleEventIdAdmin ?? null,
        payment_id: data.paymentId ?? null,
        wompi_reference: data.wompiReference ?? null,
        wompi_transaction_id: data.wompiTransactionId ?? null,
        payment_method: data.paymentMethod ?? null,
        payment_status: data.paymentStatus ?? null,
        paid_amount: data.paidAmount ?? null,
        pending_amount: data.pendingAmount ?? null,
        payment_recorded_at: firestoreTimestampToIso(data.paymentRecordedAt),
        payment_recording_notes: data.paymentRecordingNotes ?? null,
        contracted_with_products: data.contractedWithProducts === true,
        cancellation_flow: jsonOrNull(data.cancellationFlow),
        professional_kit_included: data.professionalKitIncluded === true,
        professional_kit_fee_cop: data.professionalKitFeeCOP ?? null,
        source_channel: data.sourceChannel ?? null,
        service_vertical: data.serviceVertical ?? null,
        neighborhood: data.neighborhood ?? null,
        is_referral_first_booking: data.isReferralFirstBooking === true,
        whatsapp_review_sent: data.whatsappReviewSent === true,
        whatsapp_review_sent_at: firestoreTimestampToIso(data.whatsappReviewSentAt),
        whatsapp_review_message_id: data.whatsappReviewMessageId ?? null,
        assigned_via: data.assignedVia ?? null,
        provider_geo_checkpoints: jsonOrNull(data.providerGeoCheckpoints),
        metadata: {},
        created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
        updated_at: firestoreTimestampToIso(data.updatedAt) ?? new Date().toISOString(),
      });
    }

    if (!options.dryRun && rows.length >= 500) {
      const chunk = rows.splice(0, rows.length);
      const result = await upsertRows('crm_appointments', chunk, { onConflict: 'id' });
      upserted += result.upserted;
      errors.push(...result.errors);
    }
  }

  if (options.dryRun) {
    return { table: 'crm_appointments', attempted, upserted: 0, errors: [] };
  }

  if (rows.length > 0) {
    const result = await upsertRows('crm_appointments', rows, { onConflict: 'id' });
    upserted += result.upserted;
    errors.push(...result.errors);
  }

  return { table: 'crm_appointments', attempted, upserted, errors };
}
