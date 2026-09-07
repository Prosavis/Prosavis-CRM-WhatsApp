import React from 'react';
import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { OutboundMetricsBucket, WhatsAppMetrics } from '@/types/whatsapp';

function outboundOk(data: OutboundMetricsBucket): number {
  return data.outboundOk ?? data.sent + data.delivered + data.read;
}

interface BreakdownTableProps {
  title: string;
  rows: Array<{ label: string; data: OutboundMetricsBucket; chip?: boolean }>;
}

const BreakdownTable: React.FC<BreakdownTableProps> = ({ title, rows }) => (
  <Box>
    <Typography component="h3" variant="subtitle2" fontWeight={700} gutterBottom>
      {title}
    </Typography>
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Grupo</TableCell>
            <TableCell align="right">Enviados</TableCell>
            <TableCell align="right">Entregados</TableCell>
            <TableCell align="right">Leídos</TableCell>
            <TableCell align="right">Fallidos</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(({ label, data, chip }) => (
            <TableRow key={label} hover>
              <TableCell>
                {chip ? <Chip size="small" label={label} variant="outlined" /> : label}
              </TableCell>
              <TableCell align="right">{outboundOk(data).toLocaleString('es-CO')}</TableCell>
              <TableCell align="right">{data.delivered.toLocaleString('es-CO')}</TableCell>
              <TableCell align="right">{data.read.toLocaleString('es-CO')}</TableCell>
              <TableCell align="right">{data.failed.toLocaleString('es-CO')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  </Box>
);

const OutboundBreakdownTables: React.FC<{ metrics: WhatsAppMetrics | null }> = ({
  metrics,
}) => {
  if (!metrics) return null;

  return (
    <Stack spacing={2}>
      {Object.keys(metrics.byCampaign).length > 0 ? (
        <BreakdownTable
          title="Por campaña"
          rows={Object.entries(metrics.byCampaign).map(([label, data]) => ({ label, data }))}
        />
      ) : null}
      {metrics.byKind ? (
        <BreakdownTable
          title="Por tipo de mensaje"
          rows={[
            { label: 'Sesión 24h', data: metrics.byKind.session, chip: true },
            { label: 'Plantilla / campaña', data: metrics.byKind.template, chip: true },
          ]}
        />
      ) : null}
      {metrics.byTemplate && Object.keys(metrics.byTemplate).length > 0 ? (
        <BreakdownTable
          title="Por plantilla Meta"
          rows={Object.entries(metrics.byTemplate).map(([label, data]) => ({
            label,
            data,
            chip: true,
          }))}
        />
      ) : null}
    </Stack>
  );
};

export default OutboundBreakdownTables;
