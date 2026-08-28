import { describe, expect, it } from 'vitest';
import {
  CRM_TOAST_POSITION,
  crmToastFill,
  crmToasterFill,
  inboundToastAccent,
  inboundToastFill,
  setCrmToastMode,
} from './crmToast';

describe('crmToast fills', () => {
  it('defaults toasts to bottom-center', () => {
    expect(CRM_TOAST_POSITION).toBe('bottom-center');
  });

  it('uses a light surface and tinted severity fills in day mode', () => {
    expect(crmToasterFill('light')).toBe('#FFFFFF');
    expect(crmToastFill('success', 'light')).toBe('#D1FAE5');
    expect(crmToastFill('error', 'light')).toBe('#FEE2E2');
    expect(crmToastFill('warning', 'light')).toBe('#FEF3C7');
    expect(crmToastFill('info', 'light')).toBe('#DBEAFE');
  });

  it('uses a dark surface and tinted severity fills in night mode', () => {
    expect(crmToasterFill('dark')).toBe('#171717');
    expect(crmToastFill('success', 'dark')).toBe('#064E3B');
    expect(crmToastFill('error', 'dark')).toBe('#7F1D1D');
    expect(crmToastFill('warning', 'dark')).toBe('#78350F');
    expect(crmToastFill('info', 'dark')).toBe('#1E3A5F');
  });

  it('tints inbound toasts by line without using the solid brand hex', () => {
    expect(inboundToastFill('bot', 'light')).toBe('#E8EEF4');
    expect(inboundToastFill('commercial', 'light')).toBe('#FFF1E6');
    expect(inboundToastFill('bot', 'dark')).toBe('#0A2238');
    expect(inboundToastFill('commercial', 'dark')).toBe('#4A2200');
    expect(inboundToastFill('bot', 'light')).not.toBe(inboundToastAccent('bot'));
    expect(inboundToastFill('commercial', 'light')).not.toBe(inboundToastAccent('commercial'));
  });

  it('reads the active theme mode for default fills', () => {
    setCrmToastMode('dark');
    expect(crmToastFill('success')).toBe('#064E3B');
    expect(inboundToastFill('bot')).toBe('#0A2238');
    setCrmToastMode('light');
    expect(crmToastFill('error')).toBe('#FEE2E2');
    expect(inboundToastFill('commercial')).toBe('#FFF1E6');
  });
});
