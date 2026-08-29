import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalysisMarkdown } from './AnalysisMarkdown';

describe('AnalysisMarkdown', () => {
  it('renders headings and bold instead of raw markdown markers', () => {
    const html = renderToStaticMarkup(
      createElement(AnalysisMarkdown, {
        text: '### **1. Descripción de la imagen**\n\nUn interruptor blanco.',
      }),
    );
    expect(html).toContain('1. Descripción de la imagen');
    expect(html).toContain('Un interruptor blanco.');
    expect(html).not.toContain('###');
  });
});
