import { describe, expect, it } from 'vitest';
import { evaluateCoexHealth } from '../../supabase/functions/_shared/whatsappCoexHealth';

describe('evaluateCoexHealth', () => {
  it('is healthy only when Coex stays on the Business App and Cloud API', () => {
    expect(evaluateCoexHealth({
      is_on_biz_app: true,
      platform_type: 'CLOUD_API',
    })).toMatchObject({ healthy: true, alertActive: false });
  });

  it('alerts without sending messages when the 311 leaves the Business App', () => {
    const result = evaluateCoexHealth({
      is_on_biz_app: false,
      platform_type: 'CLOUD_API',
    });
    expect(result.healthy).toBe(false);
    expect(result.alertActive).toBe(true);
    expect(result.reason).toContain('is_on_biz_app=false');
  });
});
