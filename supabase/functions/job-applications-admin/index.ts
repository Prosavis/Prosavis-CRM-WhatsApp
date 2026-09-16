import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  createManualApplication,
  getJobApplication,
  JobApplicationsError,
  listJobApplications,
  mutateApplication,
} from '../_shared/jobApplications/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, profile } = await requireCrmAdmin(req);
    const body = req.method === 'GET'
      ? Object.fromEntries(new URL(req.url).searchParams.entries())
      : await req.json().catch(() => ({}));
    const action = String(body.action ?? 'list').trim();

    switch (action) {
      case 'list':
        return jsonResponse(await listJobApplications(supabase, body));
      case 'get':
        return jsonResponse(await getJobApplication(supabase, String(body.id ?? body.applicationId ?? '')));
      case 'create':
        return jsonResponse(await createManualApplication(supabase, profile, body));
      default:
        return jsonResponse(await mutateApplication(supabase, profile, action, body));
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JobApplicationsError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    console.error('job-applications-admin error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
