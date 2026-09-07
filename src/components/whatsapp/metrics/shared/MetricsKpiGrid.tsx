import React from 'react';
import { Box } from '@mui/material';

const MetricsKpiGrid: React.FC<{ children: React.ReactNode; minWidth?: number }> = ({
  children,
  minWidth = 180,
}) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minWidth}px), 1fr))`,
      gap: 1.25,
    }}
  >
    {children}
  </Box>
);

export default MetricsKpiGrid;
