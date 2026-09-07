import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import type { OutboundMetricsBucket, WhatsAppMetrics } from '@/types/whatsapp';
import BroadcastJobsSection from './BroadcastJobsSection';
import MetricsSection from './MetricsSection';
import OutboundBreakdownTables from './OutboundBreakdownTables';
import OutboundMessageLog, { type MessageLogRow } from './OutboundMessageLog';
import MetricsContextBanner from './shared/MetricsContextBanner';
import MetricsKpiCard from './shared/MetricsKpiCard';
import MetricsKpiGrid from './shared/MetricsKpiGrid';
import {
  addStyledSheet,
  downloadWorkbook,
  excelGeneratedAtLine,
} from './utils/exportMetricsExcel';

export type { MessageLogRow } from './OutboundMessageLog';

interface OutboundPerformanceSectionProps {
  metrics: WhatsAppMetrics | null;
  days: number;
  logs: MessageLogRow[];
  logsLoading: boolean;
  logsFetchWarning: string | null;
  onClearLogsWarning: () => void;
  broadcastJobParam?: string | null;
  onInitialJobConsumed?: () => void;
}

const ROWS_PER_PAGE = 15;

function outboundOk(data: OutboundMetricsBucket): number {
  return data.outboundOk ?? data.sent + data.delivered + data.read;
}

const OutboundPerformanceSection: React.FC<OutboundPerformanceSectionProps> = ({
  metrics,
  days,
  logs,
  logsLoading,
  logsFetchWarning,
  onClearLogsWarning,
  broadcastJobParam,
  onInitialJobConsumed,
}) => {
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        !searchTerm ||
        log.recipientPhone?.includes(searchTerm) ||
        log.templateName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.messageBody?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || log.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [logs, searchTerm, statusFilter]);

  const paginatedLogs = filteredLogs.slice(
    page * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE + ROWS_PER_PAGE,
  );

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPage(0);
  };

  const outboundColumns = [
    { header: 'Enviados (sin fallos)', type: 'int' as const },
    { header: 'Entregados', type: 'int' as const },
    { header: 'Leídos', type: 'int' as const },
    { header: 'Fallidos', type: 'int' as const },
  ];

  const handleDownloadTables = () => {
    const meta = [excelGeneratedAtLine(), `Periodo: últimos ${days} días`];
    void downloadWorkbook('rendimiento-outbound.xlsx', (wb) => {
      addStyledSheet(wb, {
        name: 'Resumen KPIs',
        title: 'Rendimiento outbound',
        subtitle: 'Indicadores clave de los envíos de WhatsApp en el periodo.',
        meta,
        columns: [
          { header: 'Métrica', type: 'text' },
          { header: 'Valor', type: 'int' },
        ],
        rows: [
          ['Enviados (sin fallos)', metrics?.totalSent ?? 0],
          ['En el dispositivo (entregados + leídos)', metrics?.reachedDevice ?? 0],
          ['Leídos', metrics?.totalRead ?? 0],
          ['Fallidos', metrics?.totalFailed ?? 0],
          ['Respuestas', metrics?.totalResponses ?? 0],
          ['Opt-out', metrics?.optOutCount ?? 0],
          ['Tasa de respuesta (%)', Math.min(100, metrics?.responseRate ?? 0)],
        ],
      });

      if (metrics && Object.keys(metrics.byCampaign).length > 0) {
        addStyledSheet(wb, {
          name: 'Por campaña',
          title: 'Envíos por campaña',
          meta,
          columns: [{ header: 'Campaña', type: 'text', width: 32 }, ...outboundColumns],
          rows: Object.entries(metrics.byCampaign).map(([name, data]) => [
            name,
            outboundOk(data),
            data.delivered,
            data.read,
            data.failed,
          ]),
        });
      }

      if (metrics?.byKind) {
        addStyledSheet(wb, {
          name: 'Por tipo',
          title: 'Envíos por tipo de mensaje',
          meta,
          columns: [{ header: 'Tipo', type: 'text', width: 24 }, ...outboundColumns],
          rows: [
            ['Sesión 24h', metrics.byKind.session],
            ['Plantilla / campaña', metrics.byKind.template],
          ].map(([label, data]) => [
            label as string,
            (data as OutboundMetricsBucket).outboundOk,
            (data as OutboundMetricsBucket).delivered,
            (data as OutboundMetricsBucket).read,
            (data as OutboundMetricsBucket).failed,
          ]),
        });
      }

      if (metrics?.byTemplate && Object.keys(metrics.byTemplate).length > 0) {
        addStyledSheet(wb, {
          name: 'Por plantilla',
          title: 'Envíos por plantilla (Meta)',
          meta,
          columns: [{ header: 'Plantilla', type: 'text', width: 32 }, ...outboundColumns],
          rows: Object.entries(metrics.byTemplate).map(([name, data]) => [
            name,
            data.outboundOk,
            data.delivered,
            data.read,
            data.failed,
          ]),
        });
      }

      if (metrics) {
        addStyledSheet(wb, {
          name: 'Embudo directorio',
          title: 'Embudo directorio (secuencias / pendientes)',
          meta,
          columns: [
            { header: 'Etapa', type: 'text' },
            { header: 'Contactos', type: 'int' },
          ],
          rows: [
            ['Total', metrics.leads.total],
            ['En seguimiento', metrics.leads.enSeguimiento],
            ['En rebooking', metrics.leads.enRebooking],
            ['Con cita pendiente', metrics.leads.agendados],
            ['Opt-out', metrics.leads.optOut],
          ],
        });
      }
    });
  };

  const handleDownloadLogs = () => {
    void downloadWorkbook('registro-mensajes.xlsx', (wb) => {
      addStyledSheet(wb, {
        name: 'Mensajes',
        title: 'Registro de mensajes',
        subtitle: `${filteredLogs.length.toLocaleString('es-CO')} registro(s) según el filtro actual.`,
        meta: [excelGeneratedAtLine(), `Periodo: últimos ${days} días`],
        columns: [
          { header: 'Fecha', type: 'datetime' },
          { header: 'Destinatario', type: 'text' },
          { header: 'Plantilla', type: 'text', width: 24 },
          { header: 'Estado', type: 'text' },
          { header: 'Dirección', type: 'text' },
          { header: 'Campaña', type: 'text' },
          { header: 'Error', type: 'text', width: 36 },
        ],
        rows: filteredLogs.map((log) => [
          log.createdAt,
          log.recipientPhone || log.recipientBsuid || '',
          log.templateName || '',
          log.status,
          log.direction || '',
          log.campaignType || '',
          log.errorMessage || '',
        ]),
      });
    });
  };

  return (
    <Box>
      <MetricsSection
        title="¿Cómo rindieron los mensajes salientes?"
        subtitle={`Volumen de mensajes y alcance por contacto durante los últimos ${days} días. Los breakdowns detallan campaña, tipo y plantilla.`}
        onDownload={handleDownloadTables}
        downloadLabel="Descargar rendimiento Excel"
        defaultExpanded
        detail={<OutboundBreakdownTables metrics={metrics} />}
      >
        <Box sx={{ mb: 2 }} data-tour="whatsapp-metrics-kpis">
          <MetricsKpiGrid minWidth={170}>
            <MetricsKpiCard
              label="Mensajes enviados"
              value={(metrics?.totalSent ?? 0).toLocaleString('es-CO')}
              detail="Sin fallos"
            />
            <MetricsKpiCard
              label="En el dispositivo"
              value={(metrics?.reachedDevice ?? 0).toLocaleString('es-CO')}
              detail="Entregados + leídos"
              tone="success"
            />
            <MetricsKpiCard
              label="Mensajes leídos"
              value={(metrics?.totalRead ?? 0).toLocaleString('es-CO')}
              tone="info"
            />
            <MetricsKpiCard
              label="Mensajes fallidos"
              value={(metrics?.totalFailed ?? 0).toLocaleString('es-CO')}
              tone="risk"
            />
            <MetricsKpiCard
              label="Respuestas inbound"
              value={(metrics?.totalResponses ?? 0).toLocaleString('es-CO')}
              detail="Mensajes, no contactos"
              tone="warning"
            />
            <MetricsKpiCard
              label="Contactos opt-out"
              value={(metrics?.optOutCount ?? 0).toLocaleString('es-CO')}
              accent="text.secondary"
            />
          </MetricsKpiGrid>
        </Box>

        {metrics && (
          <Grid container spacing={2} data-tour="whatsapp-metrics-funnel">
            <Grid item xs={12} md={4}>
              <Tooltip
                title="Contactos únicos que respondieron tras un envío ÷ contactos únicos contactados."
                placement="top"
                arrow
              >
                <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%', cursor: 'help' }}>
                  <CardContent sx={{ textAlign: 'center', py: 3 }}>
                    <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
                      Tasa por contacto
                    </Typography>
                    <Typography variant="h3" fontWeight={800} color="primary">
                      {metrics.responseRate.toLocaleString('es-CO')}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(
                        metrics.responseRateDiagnostics?.responseRateNumerator ??
                        metrics.uniqueContactsResponded ??
                        0
                      ).toLocaleString('es-CO')}{' '}
                      que respondieron /{' '}
                      {(
                        metrics.responseRateDiagnostics?.responseRateDenominator ??
                        metrics.uniqueContactsMessaged ??
                        0
                      ).toLocaleString('es-CO')}{' '}
                      contactados
                    </Typography>
                  </CardContent>
                </Card>
              </Tooltip>
            </Grid>
            <Grid item xs={12} md={8}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
                    Embudo directorio (secuencias / pendientes)
                  </Typography>
                  <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                    <Chip label={`Total: ${metrics.leads.total}`} variant="outlined" />
                    <Chip label={`Seguimiento: ${metrics.leads.enSeguimiento}`} color="info" />
                    <Chip label={`Rebooking: ${metrics.leads.enRebooking}`} color="warning" />
                    <Chip
                      label={`Con cita pendiente: ${metrics.leads.agendados}`}
                      color="success"
                    />
                    <Chip label={`Opt-out: ${metrics.leads.optOut}`} color="error" />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
        {metrics?.responseRateWarning ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            La tasa por mensajes es {(metrics.rawResponseRate ?? 0).toLocaleString('es-CO')}% porque una
            persona puede responder más de una vez. La tasa principal usa contactos únicos y no se
            limita silenciosamente.
          </Alert>
        ) : null}
        <MetricsContextBanner summary="Denominadores y fuentes de Outbound">
          Los KPIs superiores cuentan mensajes. La tasa principal divide contactos únicos que
          respondieron entre contactos únicos contactados. Los envíos masivos usan su fuente de
          jobs; el registro inferior lee un máximo de 500 filas de `whatsapp_message_log`.
        </MetricsContextBanner>
      </MetricsSection>

      <BroadcastJobsSection
        days={days}
        initialJobId={broadcastJobParam}
        onInitialJobConsumed={onInitialJobConsumed}
      />

      <OutboundMessageLog
        logs={paginatedLogs}
        totalCount={filteredLogs.length}
        page={page}
        rowsPerPage={ROWS_PER_PAGE}
        loading={logsLoading}
        warning={logsFetchWarning}
        truncated={logs.length >= 500}
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        onSearchChange={(value) => {
          setSearchTerm(value);
          setPage(0);
        }}
        onStatusChange={(value) => {
          setStatusFilter(value);
          setPage(0);
        }}
        onPageChange={setPage}
        onClearFilters={clearFilters}
        onClearWarning={onClearLogsWarning}
        onDownload={handleDownloadLogs}
      />
    </Box>
  );
};

export default OutboundPerformanceSection;
