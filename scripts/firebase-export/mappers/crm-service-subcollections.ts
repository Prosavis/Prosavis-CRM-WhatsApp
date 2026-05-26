import { loadAllCollectionGroupDocs } from '../lib/firestore-reader.js';
import {
  parseAutomationExecutionPath,
  parseServiceSubcollectionPath,
} from '../lib/path-utils.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateExternalContacts(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllCollectionGroupDocs('externalContacts', 'services/');
  const rows = docs
    .map((doc) => {
      const parsed = parseServiceSubcollectionPath(doc.ref.path, 'externalContacts');
      if (!parsed) return null;
      const data = doc.data();
      return {
        id: parsed.id,
        service_id: parsed.serviceId,
        name: data.name ?? '',
        phone: data.phone ?? '',
        email: data.email ?? null,
        notes: data.notes ?? null,
        source: data.source ?? 'manual',
        status: data.status ?? 'pending',
        contacted_at: firestoreTimestampToIso(data.contactedAt),
        contacted_via: data.contactedVia ?? null,
        import_batch_id: data.importBatchId ?? null,
        created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
        updated_at: firestoreTimestampToIso(data.updatedAt) ?? new Date().toISOString(),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (options.dryRun) {
    return { table: 'crm_external_contacts', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('crm_external_contacts', rows, { onConflict: 'service_id,id' });
}

export async function migrateImportBatches(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllCollectionGroupDocs('importBatches', 'services/');
  const rows = docs
    .map((doc) => {
      const parsed = parseServiceSubcollectionPath(doc.ref.path, 'importBatches');
      if (!parsed) return null;
      const data = doc.data();
      return {
        id: parsed.id,
        service_id: parsed.serviceId,
        file_name: data.fileName ?? '',
        total_contacts: data.totalContacts ?? 0,
        imported_contacts: data.importedContacts ?? 0,
        skipped_contacts: data.skippedContacts ?? 0,
        created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (options.dryRun) {
    return { table: 'crm_import_batches', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('crm_import_batches', rows, { onConflict: 'service_id,id' });
}

export async function migrateAutomations(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllCollectionGroupDocs('automations', 'services/');
  const rows = docs
    .map((doc) => {
      const parsed = parseServiceSubcollectionPath(doc.ref.path, 'automations');
      if (!parsed) return null;
      const data = doc.data();
      return {
        id: parsed.id,
        service_id: parsed.serviceId,
        name: data.name ?? '',
        is_active: data.isActive !== false,
        trigger: data.trigger ?? {},
        delay: data.delay ?? {},
        action: data.action ?? {},
        action_config: data.actionConfig ?? {},
        created_by: data.createdBy ?? null,
        execution_count: data.executionCount ?? 0,
        created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
        updated_at: firestoreTimestampToIso(data.updatedAt) ?? new Date().toISOString(),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (options.dryRun) {
    return { table: 'crm_automations', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('crm_automations', rows, { onConflict: 'service_id,id' });
}

export async function migrateAutomationExecutions(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllCollectionGroupDocs('executions', 'services/');
  const rows = docs
    .map((doc) => {
      const parsed = parseAutomationExecutionPath(doc.ref.path);
      if (!parsed) return null;
      const data = doc.data();
      return {
        automation_id: parsed.automationId,
        service_id: parsed.serviceId,
        appointment_id: parsed.appointmentId,
        status: data.status ?? null,
        executed_at: firestoreTimestampToIso(data.executedAt),
        error_message: data.errorMessage ?? null,
        metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : {},
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (options.dryRun) {
    return {
      table: 'crm_automation_executions',
      attempted: rows.length,
      upserted: 0,
      errors: [],
    };
  }

  return upsertRows('crm_automation_executions', rows, {
    onConflict: 'service_id,automation_id,appointment_id',
  });
}

export async function migrateTasks(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllCollectionGroupDocs('tasks', 'services/');
  const rows = docs
    .map((doc) => {
      const parsed = parseServiceSubcollectionPath(doc.ref.path, 'tasks');
      if (!parsed) return null;
      const data = doc.data();
      return {
        id: parsed.id,
        service_id: parsed.serviceId,
        title: data.title ?? '',
        description: data.description ?? null,
        task_type: data.type ?? 'other',
        priority: data.priority ?? 'medium',
        status: data.status ?? 'pending',
        assignee_id: data.assigneeId ?? null,
        assignee_name: data.assigneeName ?? null,
        assignee_photo_url: data.assigneePhotoUrl ?? null,
        due_date: firestoreTimestampToIso(data.dueDate),
        completed_at: firestoreTimestampToIso(data.completedAt),
        created_by: data.createdBy ?? '',
        created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
        updated_at: firestoreTimestampToIso(data.updatedAt) ?? new Date().toISOString(),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (options.dryRun) {
    return { table: 'crm_tasks', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('crm_tasks', rows, { onConflict: 'service_id,id' });
}

export async function migrateProfileViews(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllCollectionGroupDocs('profileViews', 'services/');
  const rows = docs
    .map((doc) => {
      const parsed = parseServiceSubcollectionPath(doc.ref.path, 'profileViews');
      if (!parsed) return null;
      const data = doc.data();
      return {
        id: parsed.id,
        service_id: parsed.serviceId,
        user_id: data.userId ?? '',
        user_name: data.userName ?? '',
        user_photo_url: data.userPhotoUrl ?? null,
        viewed_at: firestoreTimestampToIso(data.viewedAt) ?? new Date().toISOString(),
        message_sent: data.messageSent === true,
        message_sent_at: firestoreTimestampToIso(data.messageSentAt),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (options.dryRun) {
    return { table: 'crm_profile_views', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('crm_profile_views', rows, { onConflict: 'service_id,id' });
}

export async function migrateTeamMembers(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllCollectionGroupDocs('teamMembers', 'services/');
  const rows = docs
    .map((doc) => {
      const parsed = parseServiceSubcollectionPath(doc.ref.path, 'teamMembers');
      if (!parsed) return null;
      const data = doc.data();
      return {
        id: parsed.id,
        service_id: parsed.serviceId,
        user_id: data.userId ?? parsed.id,
        puid: data.puid ?? null,
        name: data.name ?? '',
        email: data.email ?? '',
        photo_url: data.photoUrl ?? null,
        phone_number: data.phoneNumber ?? null,
        notes: data.notes ?? null,
        role: data.role ?? 'member',
        joined_at: firestoreTimestampToIso(data.joinedAt) ?? new Date().toISOString(),
        rating: data.rating ?? null,
        review_count: data.reviewCount ?? null,
        services_completed: data.servicesCompleted ?? null,
        days_worked_this_month: data.daysWorkedThisMonth ?? null,
        worked_dates_this_month: Array.isArray(data.workedDatesThisMonth)
          ? data.workedDatesThisMonth
          : [],
        is_active: data.isActive !== false,
        is_manual: data.isManual === true,
        bookable_by_clients: data.bookableByClients !== false,
        commission_amount: data.commissionAmount ?? null,
        contract_type: data.contractType ?? null,
        contract_params: data.contractParams ?? {},
        metadata: {},
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (options.dryRun) {
    return { table: 'crm_team_members', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('crm_team_members', rows, { onConflict: 'service_id,id' });
}
