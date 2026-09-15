import { describe, expect, it } from 'vitest';
import {
  imageAnalysisStatusFromFinishReason,
  looksIncompleteImageAnalysis,
  shouldReuseCachedImageAnalysis,
} from '../../supabase/functions/_shared/imageAnalysisCache';

const ANA_SOFIA_STUB =
  'Aquí tienes el desglose de la imagen redactado para un operador de un servicio de limpieza en Colombia:\n\n---\n\n### 1. Qué se ve en la imagen\nSe trata de';

const COMPLETE_NOTE =
  'Comprobante Bancolombia. Monto $148.000. Referencia M25086750. Origen 3150729571.';

describe('imageAnalysisStatusFromFinishReason', () => {
  it('marks MAX_TOKENS as partial and STOP as completed', () => {
    expect(imageAnalysisStatusFromFinishReason('MAX_TOKENS')).toBe('partial');
    expect(imageAnalysisStatusFromFinishReason('STOP')).toBe('completed');
    expect(imageAnalysisStatusFromFinishReason(undefined)).toBe('completed');
  });
});

describe('looksIncompleteImageAnalysis', () => {
  it('flags the Ana Sofía-style stub and dangling first heading', () => {
    expect(looksIncompleteImageAnalysis(ANA_SOFIA_STUB)).toBe(true);
    expect(looksIncompleteImageAnalysis('Es una')).toBe(true);
    expect(looksIncompleteImageAnalysis('### 1. Qué se ve en la imagen\nSe observa')).toBe(true);
    expect(looksIncompleteImageAnalysis(COMPLETE_NOTE)).toBe(false);
  });
});

describe('shouldReuseCachedImageAnalysis', () => {
  it('reuses only completed analyses that do not look truncated', () => {
    expect(shouldReuseCachedImageAnalysis({
      media_analysis_text: COMPLETE_NOTE,
      media_analysis_status: 'completed',
    })).toBe(true);
    expect(shouldReuseCachedImageAnalysis({
      media_analysis_text: ANA_SOFIA_STUB,
      media_analysis_status: 'completed',
    })).toBe(false);
    expect(shouldReuseCachedImageAnalysis({
      media_analysis_text: COMPLETE_NOTE,
      media_analysis_status: 'partial',
    })).toBe(false);
    expect(shouldReuseCachedImageAnalysis({
      media_analysis_text: COMPLETE_NOTE,
      media_analysis_status: 'completed',
    }, true)).toBe(false);
  });
});
