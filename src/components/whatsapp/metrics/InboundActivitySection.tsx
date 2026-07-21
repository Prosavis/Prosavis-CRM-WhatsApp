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
import { alpha } from '@mui/material/styles';
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
import {
  addStyledSheet,
  downloadWorkbook,
  excelGeneratedAtLine,
} from './utils/exportMetricsExcel';
import {
  BarGradient,
  ChartTooltipCard,
  chartAxisTick,
  chartColor,
  chartGridStroke,
  formatAxisInt,
  type TooltipRowSpec,
} from './utils/chartTheme';
import MetricsSection from './MetricsSection';

interface InboundActivitySectionProps {
  series?: MetricsGranularSeries<InboundTimeseriesPoint>;
  loading: boolean;
  /** Ventana de días del filtro Periodo (solo para subtítulo / Excel). */
  days?: number;
  /** Control Periodo (compartido con outbound). */
  periodControl?: React.ReactNode;
}

type InboundViewMode = 'clients' | 'messages';

const EXISTING_BLUE = '#1565c0';
const NEW_BLUE = '#42a5f5';
const MESSAGES_TEAL = '#00897b';

const GRANULARITY_LABEL: Record<MetricsGranularity, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
};

function formatInt(n: number): string {
  return n.toLocaleString('es-CO');
}

interface InboundTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; color: string }>;
  mode: InboundViewMode;
}

const InboundTooltip: React.FC<InboundTooltipProps> = ({ active, label, payload, mode }) => {
  if (!active || !payload || payload.length === 0) return null;
  const rows: TooltipRowSpec[] = payload.map((p) => ({
    label: p.name,
    value: formatInt(p.value ?? 0),
    color: p.color,
  }));
  if (mode === 'clients') {
    const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);
    rows.push({ label: 'Total', value: formatInt(total) });
  }
  return <ChartTooltipCard title={String(label ?? '')} rows={rows} />;
};

const InboundActivitySection: React.FC<InboundActivitySectionProps> = ({
  series,
  loading,
  days,
  periodControl,
}) => {
  const theme = useTheme();
  const [granularity, setGranularity] = useState<MetricsGranularity>('day');
  const [viewMode, setViewMode] = useState<InboundViewMode>('clients');

  const existingColor = chartColor(theme, EXISTING_BLUE);
  const newColor = chartColor(theme, NEW_BLUE, 0.18);
  const messagesColor = chartColor(theme, MESSAGES_TEAL);

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
    const granLabel = GRANULARITY_LABEL[granularity];
    if (viewMode === 'messages') {
      void downloadWorkbook(`mensajes-recibidos-${granularity}.xlsx`, (wb) => {
        addStyledSheet(wb, {
          name: 'Serie',
          title: 'Mensajes recibidos',
          subtitle: `Total de mensajes inbound agrupados por ${granLabel.toLowerCase()}.`,
          meta: [excelGeneratedAtLine(), `Granularidad: ${granLabel}`],
          columns: [
            { header: 'Periodo', type: 'text' },
            { header: 'Mensajes', type: 'int' },
          ],
          rows: data.map((row) => [row.label, row.messagesReceived]),
        });
        addStyledSheet(wb, {
          name: 'Totales',
          title: 'Totales del periodo',
          meta: [excelGeneratedAtLine()],
          columns: [
            { header: 'Métrica', type: 'text' },
            { header: 'Valor', type: 'int' },
          ],
          rows: [['Mensajes recibidos', totals.messagesReceived]],
        });
      });
      return;
    }
    void downloadWorkbook(`clientes-recibidos-${granularity}.xlsx`, (wb) => {
      addStyledSheet(wb, {
        name: 'Serie',
        title: 'Clientes recibidos',
        subtitle: `Personas únicas que escribieron por ${granLabel.toLowerCase()} (nuevos vs existentes).`,
        meta: [excelGeneratedAtLine(), `Granularidad: ${granLabel}`],
        columns: [
          { header: 'Periodo', type: 'text' },
          { header: 'Clientes', type: 'int' },
          { header: 'Nuevos', type: 'int' },
          { header: 'Existentes', type: 'int' },
        ],
        rows: data.map((row) => [
          row.label,
          row.uniquePeople,
          row.newPeople,
          row.existingPeople,
        ]),
      });
      addStyledSheet(wb, {
        name: 'Totales',
        title: 'Totales del periodo',
        meta: [excelGeneratedAtLine()],
        columns: [
          { header: 'Métrica', type: 'text' },
          { header: 'Valor', type: 'int' },
        ],
        rows: [
          ['Clientes únicos', totals.uniquePeople],
          ['Nuevos', totals.newPeople],
          ['Existentes', totals.existingPeople],
        ],
      });
    });
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

  const periodHint =
    typeof days === 'number' ? ` Últimos ${days} días.` : '';

  const subtitle =
    viewMode === 'messages'
      ? `Total de mensajes inbound en el periodo (no personas únicas).${periodHint} Fuente: whatsapp_message_log (inbound).`
      : `Personas únicas que escribieron en el periodo.${periodHint} Nuevo = su primer ingreso al CRM (first_contact_at) cae dentro del periodo. Existente = ya tenía registro en el CRM antes de escribir. Fuente: whatsapp_message_log (inbound) + crm_directory.`;

  const toolbar = (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      {periodControl}
      {viewToggle}
    </Stack>
  );

  return (
    <MetricsSection
      title={viewMode === 'messages' ? 'Mensajes recibidos' : 'Clientes recibidos'}
      subtitle={subtitle}
      granularity={granularity}
      onGranularityChange={setGranularity}
      toolbarExtra={toolbar}
      onDownload={handleDownload}
      downloadLabel={
        viewMode === 'messages' ? 'Descargar mensajes Excel' : 'Descargar clientes Excel'
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
              <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <BarGradient id="inboundExisting" color={existingColor} />
                  <BarGradient id="inboundNew" color={newColor} />
                  <BarGradient id="inboundMessages" color={messagesColor} />
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke={chartGridStroke(theme)}
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  tick={chartAxisTick(theme)}
                  tickLine={false}
                  axisLine={{ stroke: chartGridStroke(theme) }}
                />
                <YAxis
                  allowDecimals={false}
                  width={44}
                  tick={chartAxisTick(theme)}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatAxisInt}
                />
                <Tooltip
                  content={<InboundTooltip mode={viewMode} />}
                  cursor={{ fill: alpha(theme.palette.text.primary, 0.05) }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                {viewMode === 'clients' ? (
                  <>
                    <Bar
                      dataKey="existingPeople"
                      name="Existentes"
                      stackId="people"
                      fill="url(#inboundExisting)"
                      maxBarSize={48}
                      animationDuration={700}
                    />
                    <Bar
                      dataKey="newPeople"
                      name="Nuevos"
                      stackId="people"
                      fill="url(#inboundNew)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                      animationDuration={700}
                    />
                  </>
                ) : (
                  <Bar
                    dataKey="messagesReceived"
                    name="Mensajes"
                    fill="url(#inboundMessages)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={56}
                    animationDuration={700}
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
                  <Box component="span" fontWeight={700} color={existingColor}>
                    {formatInt(totals.existingPeople)}
                  </Box>
                </Typography>
                <Typography variant="body2">
                  Nuevos:{' '}
                  <Box component="span" fontWeight={700} color={newColor}>
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
                <Box component="span" fontWeight={700} color={messagesColor}>
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
