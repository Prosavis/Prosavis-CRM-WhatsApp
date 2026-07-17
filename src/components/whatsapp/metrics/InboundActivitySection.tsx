import React, { useMemo, useState } from 'react';
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MetricsGranularSeries, InboundTimeseriesPoint } from '@/types/whatsapp';
import {
  labelInboundSeries,
  type MetricsGranularity,
} from './utils/aggregateBuckets';
import { downloadCsv } from './utils/exportMetricsCsv';
import MetricsSection from './MetricsSection';

interface InboundActivitySectionProps {
  series?: MetricsGranularSeries<InboundTimeseriesPoint>;
  loading: boolean;
}

type InboundViewMode = 'clients' | 'messages';

const EXISTING_BLUE = '#1565c0';
const NEW_BLUE = '#64b5f6';
const MESSAGES_TEAL = '#00897b';

function formatInt(n: number): string {
  return n.toLocaleString('es-CO');
}

const InboundActivitySection: React.FC<InboundActivitySectionProps> = ({
  series,
  loading,
}) => {
  const theme = useTheme();
  const [granularity, setGranularity] = useState<MetricsGranularity>('day');
  const [viewMode, setViewMode] = useState<InboundViewMode>('clients');

  const data = useMemo(() => {
    if (!series) return [];
    return labelInboundSeries(series[granularity] ?? [], granularity);
  }, [series, granularity]);

  const totals = useMemo(() => {
    return data.reduce(
      (acc, row) => {
        acc.messagesReceived += row.messagesReceived;
        acc.newPeople += row.newPeople;
        acc.existingPeople += row.existingPeople;
        acc.uniquePeople += row.uniquePeople;
        return acc;
      },
      { messagesReceived: 0, newPeople: 0, existingPeople: 0, uniquePeople: 0 },
    );
  }, [data]);

  const handleDownload = () => {
    if (viewMode === 'messages') {
      downloadCsv(
        `mensajes-recibidos-${granularity}.csv`,
        ['periodo', 'mensajes_total'],
        data.map((row) => [row.bucket, row.messagesReceived]),
      );
      return;
    }
    downloadCsv(
      `clientes-recibidos-${granularity}.csv`,
      ['periodo', 'clientes', 'nuevos', 'existentes'],
      data.map((row) => [
        row.bucket,
        row.uniquePeople,
        row.newPeople,
        row.existingPeople,
      ]),
    );
  };

  const detailTable =
    viewMode === 'messages' ? (
      <TableContainer sx={{ maxHeight: 280 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Periodo</TableCell>
              <TableCell align="right">Mensajes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.bucket} hover>
                <TableCell>{row.label}</TableCell>
                <TableCell align="right">{formatInt(row.messagesReceived)}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  Sin datos en el periodo
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    ) : (
      <TableContainer sx={{ maxHeight: 280 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Periodo</TableCell>
              <TableCell align="right">Clientes</TableCell>
              <TableCell align="right">Nuevos</TableCell>
              <TableCell align="right">Existentes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.bucket} hover>
                <TableCell>{row.label}</TableCell>
                <TableCell align="right">{formatInt(row.uniquePeople)}</TableCell>
                <TableCell align="right">{formatInt(row.newPeople)}</TableCell>
                <TableCell align="right">{formatInt(row.existingPeople)}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  Sin datos en el periodo
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    );

  const viewToggle = (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={viewMode}
      onChange={(_, value: InboundViewMode | null) => {
        if (value) setViewMode(value);
      }}
      aria-label="Vista de métrica"
    >
      <ToggleButton value="clients">Clientes</ToggleButton>
      <ToggleButton value="messages">Mensajes</ToggleButton>
    </ToggleButtonGroup>
  );

  const subtitle =
    viewMode === 'messages'
      ? 'Total de mensajes inbound en el periodo (no personas únicas). Fuente: whatsapp_message_log (inbound).'
      : 'Personas únicas que escribieron en el periodo. Nuevo = su primer ingreso al CRM (first_contact_at) cae dentro del periodo. Existente = ya tenía registro en el CRM antes de escribir. Fuente: whatsapp_message_log (inbound) + crm_directory.';

  return (
    <MetricsSection
      title={viewMode === 'messages' ? 'Mensajes recibidos' : 'Clientes recibidos'}
      subtitle={subtitle}
      granularity={granularity}
      onGranularityChange={setGranularity}
      toolbarExtra={viewToggle}
      onDownload={handleDownload}
      downloadLabel={
        viewMode === 'messages' ? 'Descargar mensajes CSV' : 'Descargar clientes CSV'
      }
      defaultExpanded={false}
      detail={detailTable}
    >
      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Cargando actividad inbound…
        </Typography>
      ) : data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {viewMode === 'messages'
            ? 'Sin mensajes recibidos en el periodo seleccionado.'
            : 'Sin clientes que hayan escrito en el periodo seleccionado.'}
        </Typography>
      ) : (
        <>
          <Box sx={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {viewMode === 'clients' ? (
                  <>
                    <Bar
                      dataKey="existingPeople"
                      name="Existentes"
                      stackId="people"
                      fill={EXISTING_BLUE}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="newPeople"
                      name="Nuevos"
                      stackId="people"
                      fill={NEW_BLUE}
                      radius={[4, 4, 0, 0]}
                    />
                  </>
                ) : (
                  <Bar
                    dataKey="messagesReceived"
                    name="Mensajes"
                    fill={MESSAGES_TEAL}
                    radius={[4, 4, 0, 0]}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </Box>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{
              mt: 1.5,
              px: 1,
              py: 1.25,
              borderRadius: 1,
              bgcolor: 'action.hover',
            }}
            justifyContent="space-around"
            alignItems="center"
          >
            {viewMode === 'clients' ? (
              <>
                <Typography variant="body2">
                  Existentes:{' '}
                  <Box component="span" fontWeight={700} color={EXISTING_BLUE}>
                    {formatInt(totals.existingPeople)}
                  </Box>
                </Typography>
                <Typography variant="body2">
                  Nuevos:{' '}
                  <Box component="span" fontWeight={700} color={NEW_BLUE}>
                    {formatInt(totals.newPeople)}
                  </Box>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Clientes únicos (suma buckets): {formatInt(totals.uniquePeople)}
                </Typography>
              </>
            ) : (
              <Typography variant="body2">
                Mensajes recibidos:{' '}
                <Box component="span" fontWeight={700} color={MESSAGES_TEAL}>
                  {formatInt(totals.messagesReceived)}
                </Box>
              </Typography>
            )}
          </Stack>

          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
              Detalle por periodo
            </Typography>
            {detailTable}
          </Box>
        </>
      )}
    </MetricsSection>
  );
};

export default InboundActivitySection;
