export const JOB_APPLICATION_STAGES = [
  'new',
  'pending_review',
  'contacted',
  'interviewed',
  'trial',
  'possible',
  'hired',
  'rejected',
  'withdrawn',
] as const;

export type JobApplicationStage = (typeof JOB_APPLICATION_STAGES)[number];

export const JOB_STAGE_LABELS: Record<JobApplicationStage, string> = {
  new: 'Nueva',
  pending_review: 'Por revisar',
  contacted: 'Contactada',
  interviewed: 'Entrevistada',
  trial: 'En prueba',
  possible: 'Posible',
  hired: 'Contratada',
  rejected: 'Descartada',
  withdrawn: 'Retirada',
};

export const JOB_COHORTS = ['job', 'marian_special'] as const;
export type JobCohort = (typeof JOB_COHORTS)[number];

export const TRABAJO_TAG_ALIASES = [
  'job',
  'jobs',
  'marian',
  'trabajo',
  'trabajo/cv',
  'trabajo / cv',
] as const;

export const NOTICE_VERSION = 'empleo-v1-2026-09-16';
export const HISTORICAL_ACTOR_LABEL = 'Migración histórica / actor desconocido';
export const RESUME_ANALYSIS_SCHEMA_VERSION = 'empleo-extract-v1';
export const DEFAULT_RUBRIC_VERSION = 1;

export const DEFAULT_RUBRIC_CRITERIA = [
  {
    key: 'cleaning_experience',
    label: 'Experiencia en limpieza',
    description: 'Servicios de aseo, casas, empresas u hospitales citados en evidencia.',
  },
  {
    key: 'availability',
    label: 'Disponibilidad',
    description: 'Horarios, turnos, inmediatez o restricciones dichas por la persona.',
  },
  {
    key: 'location_travel',
    label: 'Ubicación y desplazamiento',
    description: 'Barrio, comuna, ciudad y disposición a desplazarse.',
  },
  {
    key: 'references',
    label: 'Referencias',
    description: 'Contactos o empleadores anteriores verificables.',
  },
  {
    key: 'documentation',
    label: 'Documentación',
    description: 'Hoja de vida, cédula u otros soportes enviados.',
  },
] as const;

export function normalizeJobTagName(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resolveJobCohortFromTag(tag: string | null | undefined): JobCohort | null {
  const normalized = normalizeJobTagName(tag);
  if (!normalized) return null;
  if (normalized === 'marian') return 'marian_special';
  if ((TRABAJO_TAG_ALIASES as readonly string[]).includes(normalized)) return 'job';
  return null;
}

export function resolveJobCohortsFromTags(tags: Array<string | null | undefined>): JobCohort[] {
  return [...new Set(tags.map(resolveJobCohortFromTag).filter((c): c is JobCohort => c != null))];
}

export function isJobApplicationStage(value: string): value is JobApplicationStage {
  return (JOB_APPLICATION_STAGES as readonly string[]).includes(value);
}

export function canTransitionJobStage(
  from: JobApplicationStage,
  to: JobApplicationStage,
  hasTeamMember: boolean,
): boolean {
  if (from === to) return true;
  if (to === 'hired' && !hasTeamMember) return false;
  return true;
}

export function digitsOnly(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function jobPhoneKey(value: string | null | undefined): string | null {
  const digits = digitsOnly(value);
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

export function jobDocumentKey(value: string | null | undefined): string | null {
  const digits = digitsOnly(value);
  return digits.length >= 5 ? digits : null;
}

export function normalizeJobEmail(value: string | null | undefined): string | null {
  const email = String(value ?? '').trim().toLowerCase();
  return email.includes('@') ? email : null;
}

export function normalizePersonName(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export interface JobIdentity {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  documentNumber?: string | null;
}

export type JobIdentityMatch =
  | { kind: 'strong'; reason: 'document' | 'email' | 'phone_and_name' }
  | { kind: 'review'; reason: 'name_only' | 'phone_conflict' | 'document_conflict' }
  | { kind: 'none' };

export function matchJobIdentity(incoming: JobIdentity, existing: JobIdentity): JobIdentityMatch {
  const incomingDoc = jobDocumentKey(incoming.documentNumber);
  const existingDoc = jobDocumentKey(existing.documentNumber);
  if (incomingDoc && existingDoc) {
    return incomingDoc === existingDoc
      ? { kind: 'strong', reason: 'document' }
      : { kind: 'review', reason: 'document_conflict' };
  }

  const incomingEmail = normalizeJobEmail(incoming.email);
  const existingEmail = normalizeJobEmail(existing.email);
  if (incomingEmail && existingEmail && incomingEmail === existingEmail) {
    return { kind: 'strong', reason: 'email' };
  }

  const incomingPhone = jobPhoneKey(incoming.phone);
  const existingPhone = jobPhoneKey(existing.phone);
  const sameName =
    Boolean(normalizePersonName(incoming.fullName)) &&
    normalizePersonName(incoming.fullName) === normalizePersonName(existing.fullName);

  if (incomingPhone && existingPhone && incomingPhone === existingPhone) {
    return sameName
      ? { kind: 'strong', reason: 'phone_and_name' }
      : { kind: 'review', reason: 'phone_conflict' };
  }

  if (sameName) return { kind: 'review', reason: 'name_only' };
  return { kind: 'none' };
}

export interface ExtractedResumeSubject {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  documentNumber?: string | null;
  confidence: number;
  evidence: string[];
}

export function shouldAutoCreateSubject(subject: ExtractedResumeSubject): boolean {
  const hasName = normalizePersonName(subject.fullName).split(' ').filter(Boolean).length >= 2;
  const hasStrongId = Boolean(
    jobDocumentKey(subject.documentNumber) ||
      normalizeJobEmail(subject.email) ||
      jobPhoneKey(subject.phone),
  );
  return hasName && hasStrongId && subject.confidence >= 0.72;
}

export function maskDocumentNumber(value: string | null | undefined): string {
  const digits = digitsOnly(value);
  if (!digits) return '—';
  if (digits.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function jobStageLabel(stage: string): string {
  return isJobApplicationStage(stage) ? JOB_STAGE_LABELS[stage] : stage;
}

export function documentKindFromMime(mimeType: string | null | undefined, mediaType?: string | null):
  | 'pdf'
  | 'image'
  | 'audio'
  | 'video'
  | 'other' {
  const mime = String(mimeType ?? '').toLowerCase();
  const media = String(mediaType ?? '').toLowerCase();
  if (mime.includes('pdf') || media === 'document') {
    return mime.includes('pdf') || media === 'document' ? (mime.includes('pdf') ? 'pdf' : 'other') : 'other';
  }
  if (mime.startsWith('image/') || media === 'image') return 'image';
  if (mime.startsWith('audio/') || media === 'audio') return 'audio';
  if (mime.startsWith('video/') || media === 'video') return 'video';
  if (mime.includes('pdf')) return 'pdf';
  return 'other';
}
