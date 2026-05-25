import React from 'react';

type FormatSegmentBase = { value: string; start: number };

type FormatSegment =
  | (FormatSegmentBase & { type: 'text' })
  | (FormatSegmentBase & { type: 'bold'; marker: string })
  | (FormatSegmentBase & { type: 'italic'; marker: string })
  | (FormatSegmentBase & { type: 'strikethrough'; marker: string })
  | (FormatSegmentBase & { type: 'monospace'; marker: string })
  | (FormatSegmentBase & { type: 'codeBlock'; marker: string });

const INLINE_MARKERS: Record<string, FormatSegment['type']> = {
  '*': 'bold',
  _: 'italic',
  '~': 'strikethrough',
  '`': 'monospace',
};

function findClosingMarker(text: string, marker: string, from: number): number {
  const close = text.indexOf(marker, from);
  if (close <= from) return -1;
  const content = text.slice(from, close);
  if (!content.trim() || content.includes('\n')) return -1;
  return close;
}

export function parseWhatsAppFormatting(text: string): FormatSegment[] {
  const segments: FormatSegment[] = [];
  let index = 0;

  while (index < text.length) {
    const codeBlockStart = text.indexOf('```', index);
    let nextInlineIndex: number | undefined;
    for (const marker of Object.keys(INLINE_MARKERS)) {
      const markerIndex = text.indexOf(marker, index);
      if (markerIndex >= 0 && (nextInlineIndex === undefined || markerIndex < nextInlineIndex)) {
        nextInlineIndex = markerIndex;
      }
    }

    const nextIndex =
      codeBlockStart >= 0 && (nextInlineIndex === undefined || codeBlockStart <= nextInlineIndex)
        ? codeBlockStart
        : nextInlineIndex;

    if (nextIndex === undefined || nextIndex < 0) {
      segments.push({ type: 'text', value: text.slice(index), start: index });
      break;
    }

    if (nextIndex > index) {
      segments.push({ type: 'text', value: text.slice(index, nextIndex), start: index });
    }

    if (text.startsWith('```', nextIndex)) {
      const close = text.indexOf('```', nextIndex + 3);
      if (close === -1) {
        segments.push({ type: 'text', value: text.slice(nextIndex), start: nextIndex });
        break;
      }
      segments.push({ type: 'codeBlock', value: text.slice(nextIndex + 3, close).trim(), marker: '```', start: nextIndex });
      index = close + 3;
      continue;
    }

    const marker = text[nextIndex];
    const type = INLINE_MARKERS[marker];
    const close = findClosingMarker(text, marker, nextIndex + 1);
    if (!type || close === -1) {
      segments.push({ type: 'text', value: marker, start: nextIndex });
      index = nextIndex + 1;
      continue;
    }

    segments.push({ type, value: text.slice(nextIndex + 1, close), marker, start: nextIndex });
    index = close + 1;
  }

  return segments.filter((segment) => segment.value.length > 0);
}

interface WhatsAppFormattedTextProps {
  text: string;
  showMarkers?: boolean;
  markerStyle?: React.CSSProperties;
}

const DEFAULT_MARKER_STYLE: React.CSSProperties = {
  opacity: 0.35,
};

function withMarkers(
  key: React.Key,
  marker: string,
  children: React.ReactNode,
  showMarkers: boolean,
  markerStyle?: React.CSSProperties,
): React.ReactNode {
  if (!showMarkers) return <React.Fragment key={key}>{children}</React.Fragment>;
  const style = { ...DEFAULT_MARKER_STYLE, ...markerStyle };
  return (
    <React.Fragment key={key}>
      <span style={style}>{marker}</span>
      {children}
      <span style={style}>{marker}</span>
    </React.Fragment>
  );
}

export const WhatsAppFormattedText: React.FC<WhatsAppFormattedTextProps> = ({
  text,
  showMarkers = false,
  markerStyle,
}) => {
  const segments = parseWhatsAppFormatting(text);

  return (
    <>
      {segments.map((segment) => {
        const key = `${segment.type}-${segment.start}`;
        switch (segment.type) {
          case 'bold':
            return withMarkers(key, segment.marker, <strong>{segment.value}</strong>, showMarkers, markerStyle);
          case 'italic':
            return withMarkers(key, segment.marker, <em>{segment.value}</em>, showMarkers, markerStyle);
          case 'strikethrough':
            return withMarkers(key, segment.marker, <del>{segment.value}</del>, showMarkers, markerStyle);
          case 'monospace':
            return withMarkers(key, segment.marker, (
              <code
                style={{
                  backgroundColor: 'rgba(0,0,0,0.06)',
                  borderRadius: 3,
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                  padding: '1px 4px',
                }}
              >
                {segment.value}
              </code>
            ), showMarkers, markerStyle);
          case 'codeBlock':
            return withMarkers(key, segment.marker, (
              <pre
                style={{
                  backgroundColor: 'rgba(0,0,0,0.08)',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                  margin: '4px 0',
                  overflowX: 'auto',
                  padding: '6px 8px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {segment.value}
              </pre>
            ), showMarkers, markerStyle);
          case 'text':
            return <React.Fragment key={key}>{segment.value}</React.Fragment>;
          default:
            return null;
        }
      })}
    </>
  );
};
