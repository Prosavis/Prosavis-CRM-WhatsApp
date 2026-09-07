import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface MetricsContextBannerProps {
  summary: string;
  children: React.ReactNode;
}

const MetricsContextBanner: React.FC<MetricsContextBannerProps> = ({ summary, children }) => (
  <Accordion
    disableGutters
    elevation={0}
    sx={{
      mb: 2,
      borderRadius: '8px !important',
      bgcolor: 'action.hover',
      '&::before': { display: 'none' },
    }}
  >
    <AccordionSummary
      expandIcon={<ExpandMoreIcon />}
      aria-label={`Cómo se calcula: ${summary}`}
      sx={{ minHeight: 44, '& .MuiAccordionSummary-content': { my: 1 } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <InfoOutlinedIcon color="primary" fontSize="small" />
        <Typography variant="body2" fontWeight={600}>
          {summary}
        </Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0 }}>
      <Typography component="div" variant="body2" color="text.secondary">
        {children}
      </Typography>
    </AccordionDetails>
  </Accordion>
);

export default MetricsContextBanner;
