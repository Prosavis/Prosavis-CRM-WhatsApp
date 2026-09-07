import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import type { MetricsDays, MetricsVista } from '@/utils/metricsVistas';

const TABS: Array<{ value: MetricsVista; label: string; group: string }> = [
  { value: 'mapa', label: 'Mapa', group: 'Operación' },
  { value: 'actividad', label: 'Actividad', group: 'Operación' },
  { value: 'calidad', label: 'Calidad', group: 'Clientes' },
  { value: 'friccion', label: 'Fricción', group: 'Clientes' },
  { value: 'clientes', label: 'Directorio', group: 'Clientes' },
  { value: 'outbound', label: 'Outbound', group: 'Mensajería' },
];

interface MetricsShellProps {
  vista: MetricsVista;
  days: MetricsDays;
  onVistaChange: (vista: MetricsVista) => void;
  onDaysChange: (days: MetricsDays) => void;
  context?: React.ReactNode;
  advancedAction?: React.ReactNode;
  children: React.ReactNode;
}

const MetricsShell: React.FC<MetricsShellProps> = ({
  vista,
  days,
  onVistaChange,
  onDaysChange,
  context,
  advancedAction,
  children,
}) => (
  <Box data-tour="whatsapp-tab-metrics">
    <Stack
      component="header"
      direction={{ xs: 'column', md: 'row' }}
      alignItems={{ xs: 'stretch', md: 'center' }}
      justifyContent="space-between"
      spacing={1.5}
      sx={{ mb: 1.5 }}
    >
      <Box>
        <Typography component="p" variant="overline" color="primary.main" fontWeight={700}>
          Sala de control
        </Typography>
        <Typography component="h1" variant="h6" fontWeight={700}>
          Métricas operativas
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="metrics-period-label">Periodo</InputLabel>
          <Select
            labelId="metrics-period-label"
            value={String(days)}
            label="Periodo"
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
        {advancedAction}
      </Stack>
    </Stack>

    {context ? <Box sx={{ mb: 1 }}>{context}</Box> : null}

    <Tabs
      value={vista}
      onChange={(_event, next: MetricsVista) => onVistaChange(next)}
      aria-label="Vistas de métricas operativas"
      variant="scrollable"
      scrollButtons="auto"
      sx={{
        mb: 2.5,
        minHeight: 42,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '& .MuiTab-root': {
          minHeight: 42,
          minWidth: 88,
          textTransform: 'none',
          fontWeight: 600,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tab
          key={tab.value}
          value={tab.value}
          label={tab.label}
          aria-label={`${tab.group}: ${tab.label}`}
        />
      ))}
    </Tabs>

    <Box component="main">{children}</Box>
  </Box>
);

export default MetricsShell;
