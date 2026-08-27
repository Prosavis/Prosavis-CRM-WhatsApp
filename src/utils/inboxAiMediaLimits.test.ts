import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_ANALYSES_PER_CONVERSATION_24H,
  MAX_IMAGE_ANALYSIS_BYTES,
  MAX_IMAGES_PER_ANALYSIS_REQUEST,
  countsTowardVisionQuota,
  inboundAudioNeedsAutoTranscription,
  isAnalyzableInboundImage,
  isVoiceTranscriptionFeatureEnabled,
  pickImagesToAnalyze,
  remainingVisionQuota,
} from '../../supabase/functions/_shared/inboxAiMediaLimits';

describe('isVoiceTranscriptionFeatureEnabled', () => {
  it('is on by default and off only for explicit falsy flags', () => {
    expect(isVoiceTranscriptionFeatureEnabled(undefined)).toBe(true);
    expect(isVoiceTranscriptionFeatureEnabled('')).toBe(true);
    expect(isVoiceTranscriptionFeatureEnabled('1')).toBe(true);
    expect(isVoiceTranscriptionFeatureEnabled('false')).toBe(false);
    expect(isVoiceTranscriptionFeatureEnabled('OFF')).toBe(false);
  });
});

describe('inboundAudioNeedsAutoTranscription', () => {
  it('requires inbound audio with message id and media id', () => {
    expect(inboundAudioNeedsAutoTranscription({
      mediaType: 'audio',
      messageLogId: 'm1',
      mediaId: 'wa1',
    })).toBe(true);
    expect(inboundAudioNeedsAutoTranscription({
      mediaType: 'image',
      messageLogId: 'm1',
      mediaId: 'wa1',
    })).toBe(false);
    expect(inboundAudioNeedsAutoTranscription({
      mediaType: 'audio',
      messageLogId: 'm1',
      mediaId: null,
    })).toBe(false);
  });
});

describe('isAnalyzableInboundImage', () => {
  const base = {
    direction: 'inbound',
    media_type: 'image',
    storage_path: '57300/abc.jpg',
    size_bytes: 120_000,
    mime_type: 'image/jpeg',
  };

  it('accepts a stored inbound photo under 5 MB', () => {
    expect(isAnalyzableInboundImage(base)).toEqual({ ok: true });
  });

  it('rejects stickers, missing storage, and oversized files', () => {
    expect(isAnalyzableInboundImage({ ...base, media_type: 'sticker' })).toEqual({
      ok: false,
      reason: 'not_image',
    });
    expect(isAnalyzableInboundImage({ ...base, storage_path: null })).toEqual({
      ok: false,
      reason: 'no_storage_path',
    });
    expect(isAnalyzableInboundImage({
      ...base,
      size_bytes: MAX_IMAGE_ANALYSIS_BYTES + 1,
    })).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });
});

describe('vision quota', () => {
  it('ignores reused analyses and counts pending plus recent Gemini calls', () => {
    const since = '2026-08-26T00:00:00.000Z';
    expect(countsTowardVisionQuota({
      media_analysis_model: 'reuse:gemini-3.6-flash',
      media_analysis_at: '2026-08-26T12:00:00.000Z',
    }, since)).toBe(false);
    expect(countsTowardVisionQuota({
      media_analysis_status: 'pending',
    }, since)).toBe(true);
    expect(countsTowardVisionQuota({
      media_analysis_model: 'gemini-3.6-flash',
      media_analysis_failed_at: '2026-08-26T12:00:00.000Z',
    }, since)).toBe(true);
  });

  it('caps a request at 8 and the conversation at 20 / 24h', () => {
    expect(remainingVisionQuota(18)).toBe(2);
    const picked = pickImagesToAnalyze(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      remainingVisionQuota(0),
    );
    expect(picked.selected).toHaveLength(MAX_IMAGES_PER_ANALYSIS_REQUEST);
    expect(picked.skipped[0]).toEqual({ id: 'i', reason: 'max_per_request' });

    const daily = pickImagesToAnalyze(['a', 'b'], remainingVisionQuota(MAX_IMAGE_ANALYSES_PER_CONVERSATION_24H));
    expect(daily.selected).toEqual([]);
    expect(daily.skipped).toEqual([
      { id: 'a', reason: 'daily_cap' },
      { id: 'b', reason: 'daily_cap' },
    ]);
  });
});
