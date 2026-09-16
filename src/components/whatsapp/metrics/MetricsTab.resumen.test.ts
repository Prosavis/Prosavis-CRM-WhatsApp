import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MetricsTab resumen alignment', () => {
  const source = readFileSync(resolve(__dirname, './MetricsTab.tsx'), 'utf8');

  it('opens on resumen and keeps completed services out of inbound', () => {
    expect(source).toContain('useWhatsAppMetricsQueries');
    expect(source).toContain("vista === 'resumen'");
    expect(source).toContain("vista === 'app'");
    expect(source).toContain('AppDataSection');
    expect(source).toContain('LifetimeRevenueBanner');
    expect(source).toContain('CompletedServicesSection');
    expect(source).toContain("vista === 'actividad'");

    const actividadBlock = source.slice(source.indexOf("{vista === 'actividad' &&"));
    const outboundIndex = actividadBlock.indexOf("{vista === 'outbound' &&");
    const inboundOnly = outboundIndex >= 0 ? actividadBlock.slice(0, outboundIndex) : actividadBlock;
    expect(inboundOnly).toContain('InboundActivitySection');
    expect(inboundOnly).not.toContain('CompletedServicesSection');
    expect(inboundOnly).not.toContain('LifetimeRevenueBanner');
  });
});
