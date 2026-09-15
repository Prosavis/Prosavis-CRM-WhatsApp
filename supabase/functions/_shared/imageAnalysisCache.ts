export function imageAnalysisStatusFromFinishReason(
  finishReason?: string,
): 'completed' | 'partial' {
  return finishReason === 'MAX_TOKENS' ? 'partial' : 'completed';
}

/** Stubs viejos de Gemini 3.6 (thinking se comió maxOutputTokens: 1024). */
export function looksIncompleteImageAnalysis(text: unknown): boolean {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return true;
  if (/^aquí tienes\b/i.test(value) && value.length < 400) return true;
  if (/\bse trata de\s*$/i.test(value)) return true;
  if (/\bes una\s*$/i.test(value)) return true;
  if (value.length < 250 && /###\s*1\./.test(value) && !/\n###\s*2\./.test(value)) {
    return true;
  }
  return false;
}

export function shouldReuseCachedImageAnalysis(
  row: {
    media_analysis_text?: unknown;
    media_analysis_status?: unknown;
  },
  force?: boolean,
): boolean {
  if (force) return false;
  const status = String(row.media_analysis_status ?? '').trim();
  if (status !== 'completed') return false;
  const text = typeof row.media_analysis_text === 'string' ? row.media_analysis_text.trim() : '';
  if (!text) return false;
  return !looksIncompleteImageAnalysis(text);
}
