import { describe, expect, it } from 'vitest';
import { formatCoverageCatalogBlock } from '../../supabase/functions/_shared/coverageCatalog';

describe('formatCoverageCatalogBlock', () => {
  it('lists the official Risaralda service zones and forbids inventing other cities', () => {
    const block = formatCoverageCatalogBlock();

    expect(block).toContain('=== Cobertura oficial de servicios (fuente de verdad) ===');
    expect(block).toContain('Cra. 23 #85-13 Manzana 5 Casa 17, Pereira, Risaralda');
    expect(block).toContain('https://maps.app.goo.gl/xnKEMBYy6T3KuCAL8');
    expect(block).toContain('Pereira — cobertura directa');
    expect(block).toContain('Dosquebradas — cobertura directa');
    expect(block).toContain('Cerritos — cobertura directa');
    expect(block).toContain('Santa Rosa de Cabal');
    expect(block).toMatch(/Bogotá/);
    expect(block).toMatch(/no hay cobertura/i);
    expect(block).not.toMatch(/atendemos en las principales zonas de Bogotá/i);
  });
});
