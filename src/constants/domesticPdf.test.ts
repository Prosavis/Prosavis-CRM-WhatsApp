import { describe, expect, it } from 'vitest';
import { snippetAttachesDomesticPdf } from './domesticPdf';

describe('snippetAttachesDomesticPdf', () => {
  it('attaches the domestic pdf only for /hogar', () => {
    expect(snippetAttachesDomesticPdf('/hogar')).toBe(true);
    expect(snippetAttachesDomesticPdf(' /Hogar ')).toBe(true);
    expect(snippetAttachesDomesticPdf('/trabajo')).toBe(false);
    expect(snippetAttachesDomesticPdf('/inicio')).toBe(false);
  });
});
