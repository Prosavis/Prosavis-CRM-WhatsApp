// deno-lint-ignore-file no-explicit-any
import {
  DEFAULT_GEMINI_MODEL,
  getGeminiApiKey,
  geminiGenerateJson,
  geminiGenerateJsonFromFile,
  geminiTranscribeAudioComplete,
  resolveGeminiModel,
} from '../geminiClient.ts';
import { downloadWhatsAppBucketBytes } from '../whatsappMediaStorage.ts';
import {
  RESUME_ANALYSIS_SCHEMA_VERSION,
  type ExtractedResumeSubject,
} from '../jobApplications/domain.ts';
import { planSubjectActions } from './applySubjects.ts';
import { LABOR_EXTRACT_PROMPT, LABOR_EXTRACT_SYSTEM, RESUME_EXTRACT_JSON_SCHEMA } from './schema.ts';

type SupabaseClient = any;

export interface ResumeExtractResult {
  summary: string;
  subjects: ExtractedResumeSubject[];
  facts: Array<{ key: string; value: string; evidence: string; page?: number | null }>;
}

function asExtract(value: ResumeExtractResult | null | undefined): ResumeExtractResult {
  return {
    summary: String(value?.summary ?? '').trim(),
    subjects: Array.isArray(value?.subjects) ? value.subjects : [],
    facts: Array.isArray(value?.facts) ? value.facts : [],
  };
}

async function downloadAssetBytes(
  supabase: SupabaseClient,
  asset: { bucket_id: string; storage_path: string },
): Promise<Uint8Array> {
  if (asset.bucket_id === 'whatsapp-media') {
    return downloadWhatsAppBucketBytes(supabase, asset.storage_path);
  }
  const { data, error } = await supabase.storage
    .from(asset.bucket_id)
    .download(asset.storage_path);
  if (error || !data) {
    throw new Error(error?.message || 'No se pudo descargar el documento');
  }
  return new Uint8Array(await data.arrayBuffer());
}

async function extractFromText(transcript: string): Promise<ResumeExtractResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY');
  const data = await geminiGenerateJson<ResumeExtractResult>({
    apiKey,
    model: resolveGeminiModel('GEMINI_MODEL_DOCUMENT_ANALYSIS', DEFAULT_GEMINI_MODEL),
    systemInstruction: LABOR_EXTRACT_SYSTEM,
    prompt: `${LABOR_EXTRACT_PROMPT}\n\nTexto:\n${transcript.slice(0, 20000)}`,
    responseJsonSchema: RESUME_EXTRACT_JSON_SCHEMA,
    temperature: 0,
    maxOutputTokens: 8192,
    logScope: 'document-analysis-text',
  });
  return asExtract(data);
}

async function extractFromFile(
  buffer: Uint8Array,
  mimeType: string,
  extraPrompt = '',
): Promise<ResumeExtractResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY');
  const data = await geminiGenerateJsonFromFile<ResumeExtractResult>({
    apiKey,
    buffer,
    mimeType,
    systemInstruction: LABOR_EXTRACT_SYSTEM,
    prompt: `${LABOR_EXTRACT_PROMPT}${extraPrompt ? `\n${extraPrompt}` : ''}`,
    responseJsonSchema: RESUME_EXTRACT_JSON_SCHEMA,
  });
  return asExtract(data);
}

export async function processDocumentAnalysisJob(
  supabase: SupabaseClient,
  job: {
    id: string;
    asset_id: string;
    kind: string;
    schema_version: string;
    payload: Record<string, unknown>;
  },
  worker: string,
): Promise<{ ok: true; resultId: string } | { ok: false; error: string }> {
  try {
    const { data: cached } = await supabase
      .from('document_analysis_results')
      .select('id, result, facts, subjects, evidence, confidence, model')
      .eq('asset_id', job.asset_id)
      .eq('kind', job.kind)
      .eq('schema_version', job.schema_version)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let extracted: ResumeExtractResult;
    let model = resolveGeminiModel('GEMINI_MODEL_DOCUMENT_ANALYSIS', DEFAULT_GEMINI_MODEL);
    let reusedTranscript = false;

    if (cached?.result) {
      extracted = asExtract(cached.result as ResumeExtractResult);
      model = String(cached.model || model);
    } else {
      const { data: asset, error: assetError } = await supabase
        .from('document_assets')
        .select('id, bucket_id, storage_path, mime_type, kind')
        .eq('id', job.asset_id)
        .single();
      if (assetError || !asset) throw new Error(assetError?.message || 'asset not found');

      const messageLogId = typeof job.payload?.messageLogId === 'string'
        ? job.payload.messageLogId
        : null;

      if (job.kind === 'audio_transcript' && messageLogId) {
        const { data: message } = await supabase
          .from('whatsapp_message_log')
          .select('voice_transcription, mime_type')
          .eq('id', messageLogId)
          .maybeSingle();
        if (message?.voice_transcription) {
          extracted = await extractFromText(String(message.voice_transcription));
          reusedTranscript = true;
          model = 'reuse:voice_transcription';
        }
      }

      if (!extracted!) {
        const bytes = await downloadAssetBytes(supabase, asset);
        if (job.kind === 'audio_transcript') {
          const apiKey = getGeminiApiKey();
          if (!apiKey) throw new Error('Falta GEMINI_API_KEY');
          const transcript = await geminiTranscribeAudioComplete({
            apiKey,
            buffer: bytes,
            mimeType: String(asset.mime_type || 'audio/ogg'),
          });
          extracted = await extractFromText(transcript.text);
        } else if (job.kind === 'image_extract') {
          extracted = await extractFromFile(
            bytes,
            String(asset.mime_type || 'image/jpeg'),
            'Este archivo es una imagen, no una cotización de aseo.',
          );
        } else {
          extracted = await extractFromFile(
            bytes,
            String(asset.mime_type || 'application/pdf'),
          );
        }
      }
    }

    const { data: resultId, error: completeError } = await supabase.rpc(
      'complete_document_analysis_job',
      {
        p_job_id: job.id,
        p_worker: worker,
        p_model: model,
        p_result: {
          ...extracted,
          schemaVersion: RESUME_ANALYSIS_SCHEMA_VERSION,
          reusedTranscript,
        },
        p_facts: extracted.facts,
        p_subjects: extracted.subjects,
        p_evidence: extracted.facts.map((fact) => fact.evidence),
        p_confidence: extracted.subjects[0]?.confidence ?? null,
      },
    );
    if (completeError) throw completeError;

    const applicationId = typeof job.payload?.applicationId === 'string'
      ? job.payload.applicationId
      : null;
    if (applicationId) {
      await applyExtractedResult(supabase, applicationId, extracted);
    }

    return { ok: true, resultId: String(resultId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.rpc('fail_document_analysis_job', {
      p_job_id: job.id,
      p_worker: worker,
      p_error: message,
    }).catch(() => undefined);
    return { ok: false, error: message };
  }
}

export async function applyExtractedResult(
  supabase: SupabaseClient,
  applicationId: string,
  extracted: ResumeExtractResult,
): Promise<void> {
  const plan = planSubjectActions(extracted.subjects);
  const { data: application } = await supabase
    .from('job_applications')
    .select('id, candidate_id, stage')
    .eq('id', applicationId)
    .maybeSingle();
  if (!application) return;

  if (plan.keep) {
    await supabase
      .from('job_candidates')
      .update({
        full_name: plan.keep.fullName,
        phone: plan.keep.phone ?? undefined,
        email: plan.keep.email ?? undefined,
        document_number: plan.keep.documentNumber ?? undefined,
        identity_basis: 'extracted',
      })
      .eq('id', application.candidate_id);
  }

  for (const split of plan.splits.filter((item) => item.autoCreate)) {
    await supabase.rpc('split_job_application', {
      p_application_id: applicationId,
      p_full_name: split.subject.fullName,
      p_asset_ids: [],
      p_actor_kind: 'system',
      p_actor_id: 'document-analysis-worker',
      p_actor_label: 'Análisis documental',
      p_phone: split.subject.phone,
      p_email: split.subject.email,
      p_document_number: split.subject.documentNumber,
    });
  }

  if (plan.needsReview) {
    await supabase
      .from('job_applications')
      .update({
        needs_review: true,
        review_reason: plan.reviewReason,
        stage: application.stage === 'new' ? 'pending_review' : application.stage,
      })
      .eq('id', applicationId);
    await supabase.from('job_application_events').insert({
      application_id: applicationId,
      event_type: 'review_flagged',
      actor_kind: 'system',
      actor_id: 'document-analysis-worker',
      actor_label: 'Análisis documental',
      payload: { reason: plan.reviewReason, subjects: extracted.subjects.length },
    });
  }

  const { data: rubric } = await supabase
    .from('job_evaluation_rubrics')
    .select('id, criteria')
    .eq('is_active', true)
    .maybeSingle();
  if (!rubric) return;

  const scores: Record<string, { score: number; evidence: string[] }> = {};
  const criteria = Array.isArray(rubric.criteria) ? rubric.criteria : [];
  for (const item of criteria) {
    const key = String((item as { key?: string }).key ?? '');
    if (!key) continue;
    const matches = extracted.facts.filter((fact) =>
      fact.key === key || fact.key.includes(key) || fact.value.toLowerCase().includes(key.replace('_', ' '))
    );
    scores[key] = {
      score: matches.length > 0 ? Math.min(1, 0.4 + matches.length * 0.2) : 0,
      evidence: matches.map((fact) => fact.evidence).slice(0, 3),
    };
  }

  await supabase.from('job_candidate_evaluations').insert({
    application_id: applicationId,
    rubric_id: rubric.id,
    scores,
    summary: extracted.summary,
    model: 'empleo-extract-v1',
    schema_version: RESUME_ANALYSIS_SCHEMA_VERSION,
  });
  await supabase.from('job_application_events').insert({
    application_id: applicationId,
    event_type: 'evaluation_scored',
    actor_kind: 'system',
    actor_id: 'document-analysis-worker',
    actor_label: 'Análisis documental',
    payload: { summary: extracted.summary },
  });
}
