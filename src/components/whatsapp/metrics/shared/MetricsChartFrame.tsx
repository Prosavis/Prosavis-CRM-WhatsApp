import React from 'react';
import { Box, Stack, Typography } from '@mui/material';

interface MetricsChartFrameProps {
  title: string;
  description?: string;
  unit?: string;
  summary: string;
  height?: number;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  dataTable?: React.ReactNode;
}

const MetricsChartFrame: React.FC<MetricsChartFrameProps> = ({
  title,
  description,
  unit,
  summary,
  height = 300,
  toolbar,
  children,
  dataTable,
}) => {
  const summaryId = React.useId();

  return (
    <Box
      component="section"
      aria-labelledby={`${summaryId}-title`}
      aria-describedby={summaryId}
      sx={{
        mb: 2,
        p: { xs: 1.5, sm: 2.25 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
            <Typography id={`${summaryId}-title`} component="h2" variant="subtitle1" fontWeight={700}>
              {title}
            </Typography>
            {unit ? (
              <Typography variant="caption" color="text.secondary">
                {unit}
              </Typography>
            ) : null}
          </Stack>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {toolbar}
      </Stack>
      <Typography
        id={summaryId}
        variant="body2"
        sx={{ mb: 1.5, maxWidth: 760 }}
      >
        {summary}
      </Typography>
      <Box
        role="img"
        aria-label={`${title}. ${summary}`}
        sx={{ height: { xs: Math.min(height, 260), sm: height } }}
      >
        {children}
      </Box>
      {dataTable ? (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
            Datos de la visualización
          </Typography>
          {dataTable}
        </Box>
      ) : null}
    </Box>
  );
};

export default MetricsChartFrame;
