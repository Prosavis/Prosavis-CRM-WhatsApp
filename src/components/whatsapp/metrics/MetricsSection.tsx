import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Collapse,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DownloadIcon from '@mui/icons-material/Download';
import type { MetricsGranularity } from './utils/aggregateBuckets';

export interface MetricsSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  granularity?: MetricsGranularity;
  onGranularityChange?: (value: MetricsGranularity) => void;
  /** Controles extra a la izquierda del download (p.ej. switch Clientes/Mensajes). */
  toolbarExtra?: React.ReactNode;
  onDownload?: () => void;
  downloadLabel?: string;
}

const MetricsSection: React.FC<MetricsSectionProps> = ({
  title,
  subtitle,
  children,
  detail,
  defaultExpanded = false,
  expanded: expandedProp,
  onExpandedChange,
  granularity,
  onGranularityChange,
  toolbarExtra,
  onDownload,
  downloadLabel = 'Descargar CSV',
}) => {
  const [uncontrolledExpanded, setUncontrolledExpanded] = React.useState(defaultExpanded);
  const expanded = expandedProp ?? uncontrolledExpanded;
  const setExpanded = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(expanded) : next;
    onExpandedChange?.(value);
    if (expandedProp === undefined) setUncontrolledExpanded(value);
  };

  return (
    <Card
      elevation={0}
      sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
    >
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {granularity && onGranularityChange && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={granularity}
                onChange={(_, value: MetricsGranularity | null) => {
                  if (value) onGranularityChange(value);
                }}
              >
                <ToggleButton value="day">Día</ToggleButton>
                <ToggleButton value="week">Semana</ToggleButton>
                <ToggleButton value="month">Mes</ToggleButton>
              </ToggleButtonGroup>
            )}
            {toolbarExtra}
            {onDownload && (
              <Tooltip title={downloadLabel}>
                <IconButton size="small" onClick={onDownload} aria-label={downloadLabel}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {detail && (
              <Tooltip title={expanded ? 'Ocultar detalle' : 'Ver detalle'}>
                <IconButton
                  size="small"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  aria-label={expanded ? 'Ocultar detalle' : 'Ver detalle'}
                >
                  {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>
        {children}
        {detail && (
          <Collapse in={expanded} unmountOnExit>
            <Box sx={{ mt: 2 }}>{detail}</Box>
          </Collapse>
        )}
      </CardContent>
    </Card>
  );
};

export default MetricsSection;
