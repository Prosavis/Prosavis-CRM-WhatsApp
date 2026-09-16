import type { JobApplicationStage, JobCohort } from '@/utils/jobApplicationsDomain';

export interface JobApplicationListItem {
  id: string;
  cohort: JobCohort;
  stage: JobApplicationStage;
  assigned_to: string | null;
  needs_review: boolean;
  review_reason: string | null;
  source_channel: string;
  origin_label: string | null;
  created_by_label: string | null;
  created_at: string;
  hired_at: string | null;
  directory_id: string | null;
  team_member_id: string | null;
  candidate?: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    document_number: string | null;
    location_text: string | null;
  } | null;
  directory?: {
    id: string;
    full_name: string;
    display_name: string | null;
    phone: string | null;
    photo_url: string | null;
  } | null;
}

export interface JobApplicationsListResponse {
  items: JobApplicationListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface JobApplicationsMetrics {
  total: number;
  job: number;
  marianSpecial: number;
  needsReview: number;
  hired: number;
  rejectedOrWithdrawn: number;
  byStage: Record<string, number>;
  bySourceChannel: Record<string, number>;
}

export interface JobApplicationDetail {
  application: JobApplicationListItem & Record<string, unknown>;
  analyses: Array<Record<string, unknown>>;
  noticeVersion: string;
}

export interface JobTeamMember {
  id: string;
  service_id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  is_active: boolean;
  photo_url?: string | null;
}
