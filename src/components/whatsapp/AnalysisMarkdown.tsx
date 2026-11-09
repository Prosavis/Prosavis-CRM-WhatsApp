import ReactMarkdown from 'react-markdown';
import { Box, Typography } from '@mui/material';

interface AnalysisMarkdownProps {
  text: string;
}

const analysisTextWrapSx = {
  minWidth: 0,
  maxWidth: '100%',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
} as const;

export function AnalysisMarkdown({ text }: AnalysisMarkdownProps) {
  return (
    <Box
      sx={{
        ...analysisTextWrapSx,
        mt: 0.25,
        '& p': { m: 0, mb: 0.75 },
        '& p:last-child': { mb: 0 },
        '& pre, & code': {
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          maxWidth: '100%',
        },
      }}
    >
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <Typography variant="subtitle1" fontWeight={700} sx={{ ...analysisTextWrapSx, mt: 1, mb: 0.5 }}>
              {children}
            </Typography>
          ),
          h2: ({ children }) => (
            <Typography variant="subtitle2" fontWeight={700} sx={{ ...analysisTextWrapSx, mt: 1, mb: 0.5 }}>
              {children}
            </Typography>
          ),
          h3: ({ children }) => (
            <Typography variant="subtitle2" fontWeight={700} sx={{ ...analysisTextWrapSx, mt: 1, mb: 0.5 }}>
              {children}
            </Typography>
          ),
          p: ({ children }) => (
            <Typography variant="body2" sx={{ ...analysisTextWrapSx, whiteSpace: 'pre-wrap' }}>
              {children}
            </Typography>
          ),
          strong: ({ children }) => (
            <Box component="strong" sx={{ fontWeight: 700 }}>
              {children}
            </Box>
          ),
          em: ({ children }) => (
            <Box component="em" sx={{ fontStyle: 'italic' }}>
              {children}
            </Box>
          ),
          ul: ({ children }) => (
            <Box component="ul" sx={{ ...analysisTextWrapSx, pl: 2.5, my: 0.5 }}>
              {children}
            </Box>
          ),
          ol: ({ children }) => (
            <Box component="ol" sx={{ ...analysisTextWrapSx, pl: 2.5, my: 0.5 }}>
              {children}
            </Box>
          ),
          li: ({ children }) => (
            <Typography component="li" variant="body2" sx={{ ...analysisTextWrapSx, mb: 0.25 }}>
              {children}
            </Typography>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </Box>
  );
}
