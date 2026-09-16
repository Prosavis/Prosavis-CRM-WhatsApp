import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { computeSha256Hex, extensionFromMimeType } from '../_shared/whatsappMediaStorage.ts';
import { documentKindFromMime } from '../_shared/jobApplications/domain.ts';

function analysisKindFor(kind: string): 'resume_extract' | 'audio_transcript' | 'image_extract' | null {
  if (kind === 'audio') return 'audio_transcript';
  if (kind === 'image') return 'image_extract';
  if (kind === 'pdf' || kind === 'other') return 'resume_extract';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, profile } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'status').trim();

    if (action === 'enqueue') {
      const applicationId = String(body.applicationId ?? '');
      if (!applicationId) return jsonResponse({ error: 'applicationId es requerido' }, 400);
      const { data, error } = await supabase.rpc('enqueue_whatsapp_media_for_application', {
        p_application_id: applicationId,
      });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse(data);
    }

    if (action === 'signedUrl') {
      const assetId = String(body.assetId ?? '');
      const { data: asset, error } = await supabase
        .from('document_assets')
        .select('bucket_id, storage_path')
        .eq('id', assetId)
        .maybeSingle();
      if (error || !asset) return jsonResponse({ error: 'Documento no encontrado' }, 404);
      const signed = await supabase.storage
        .from(asset.bucket_id)
        .createSignedUrl(asset.storage_path, 15 * 60);
      if (signed.error || !signed.data?.signedUrl) {
        return jsonResponse({ error: signed.error?.message || 'No se pudo firmar la URL' }, 400);
      }
      return jsonResponse({ url: signed.data.signedUrl });
    }

    if (action === 'upload') {
      const applicationId = String(body.applicationId ?? '');
      const filename = String(body.filename ?? 'documento.pdf');
      const mimeType = String(body.mimeType ?? 'application/pdf');
      const contentBase64 = String(body.contentBase64 ?? '');
      if (!applicationId || !contentBase64) {
        return jsonResponse({ error: 'applicationId y contentBase64 son requeridos' }, 400);
      }
      const binary = Uint8Array.from(atob(contentBase64), (char) => char.charCodeAt(0));
      const sha256 = await computeSha256Hex(binary);
      const kind = documentKindFromMime(mimeType);
      const path = `${applicationId}/${sha256}.${extensionFromMimeType(mimeType)}`;
      const uploaded = await supabase.storage.from('crm-documents').upload(path, binary, {
        contentType: mimeType,
        upsert: true,
      });
      if (uploaded.error) return jsonResponse({ error: uploaded.error.message }, 400);

      const { data: asset, error: assetError } = await supabase
        .from('document_assets')
        .upsert({
          sha256,
          mime_type: mimeType,
          kind,
          byte_size: binary.byteLength,
          bucket_id: 'crm-documents',
          storage_path: path,
          original_filename: filename,
        }, { onConflict: 'sha256' })
        .select('id')
        .single();
      if (assetError || !asset) return jsonResponse({ error: assetError?.message || 'No se guardó el asset' }, 400);

      const { data: source } = await supabase
        .from('document_sources')
        .insert({
          asset_id: asset.id,
          source_kind: 'manual_upload',
          uploaded_by: profile.id,
          metadata: { filename },
        })
        .select('id')
        .single();

      await supabase.from('job_application_documents').upsert({
        application_id: applicationId,
        asset_id: asset.id,
        source_id: source?.id ?? null,
        role: kind === 'pdf' ? 'cv' : kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : 'supporting',
      }, { onConflict: 'application_id,asset_id' });

      const analysisKind = analysisKindFor(kind);
      if (analysisKind) {
        await supabase.from('document_analysis_jobs').insert({
          asset_id: asset.id,
          kind: analysisKind,
          schema_version: 'empleo-extract-v1',
          payload: { applicationId },
        });
      }
      return jsonResponse({ assetId: asset.id, sha256 });
    }

    if (action === 'status') {
      const assetId = String(body.assetId ?? '');
      const { data, error } = await supabase
        .from('document_analysis_jobs')
        .select('id, status, kind, last_error, updated_at')
        .eq('asset_id', assetId)
        .order('created_at', { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ jobs: data ?? [] });
    }

    return jsonResponse({ error: `Acción no soportada: ${action}` }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('document-analysis-admin error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
