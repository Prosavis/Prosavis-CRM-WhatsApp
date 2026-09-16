import React from 'react';
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import type { MetricsDays } from '@/utils/metricsVistas';

interface MetricsPeriodControlProps {
  days: MetricsDays;
  onDaysChange: (days: MetricsDays) => void;
  label?: string;
}

const MetricsPeriodControl: React.FC<MetricsPeriodControlProps> = ({
  days,
  onDaysChange,
  label = 'Periodo',
}) => (
  <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 140 }, width: { xs: '100%', sm: 'auto' }, maxWidth: '100%' }}>
    <InputLabel id="metrics-local-period-label">{label}</InputLabel>
    <Select
      labelId="metrics-local-period-label"
      value={String(days)}
      label={label}
      onChange={(event: SelectChangeEvent) => {
        const next = event.target.value;
        onDaysChange(next === 'all' ? 'all' : Number(next));
      }}
    >
      <MenuItem value="7">7 días</MenuItem>
      <MenuItem value="14">14 días</MenuItem>
      <MenuItem value="30">30 días</MenuItem>
      <MenuItem value="60">60 días</MenuItem>
      <MenuItem value="90">90 días</MenuItem>
      <MenuItem value="all">Histórico</MenuItem>
    </Select>
  </FormControl>
);

export default MetricsPeriodControl;
