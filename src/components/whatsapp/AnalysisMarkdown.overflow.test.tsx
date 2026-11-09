import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalysisMarkdown } from './AnalysisMarkdown';

const LONG_ID = '12755309674289745976896172603738450';

describe('AnalysisMarkdown overflow', () => {
  it('keeps an unbroken payment id inside the analysis text', () => {
    render(
      <div style={{ width: 240 }}>
        <AnalysisMarkdown text={`- ID Transacción: ${LONG_ID}`} />
      </div>,
    );

    const id = screen.getByText(new RegExp(LONG_ID));
    const style = getComputedStyle(id);
    expect(style.overflowWrap).toBe('anywhere');
    expect(style.wordBreak).toBe('break-word');
    expect(style.maxWidth).toBe('100%');
  });
});
