// directory-ai-analyze: usa Gemini para PROPONER (no aplicar) arreglos de calidad
// sobre crm_directory, a partir de los issues abiertos del orquestador.
// El motor de análisis vive en `_shared/directoryAnalyze.ts` y se reutiliza desde
// `directory-monitor`; aquí solo se aplica la autenticación CRM (admin Supabase).

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { formatError } from '../_shared/errors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { runDirectoryAnalysis } from '../_shared/directoryAnalyze.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const result = await runDirectoryAnalysis(supabase, body);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof Response) return error;
    const message = formatError(error);
    if (message.includes('GEMINI_API_KEY')) {
      return jsonResponse({ error: message }, 412);
    }
    return jsonResponse({ error: message }, 500);
  }
});
