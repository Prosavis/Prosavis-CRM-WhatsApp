import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import SearchIcon from '@mui/icons-material/Search';
import MetricsDataTable from './shared/MetricsDataTable';

export interface MessageLogRow {
  id: string;
  phoneNumberId?: string;
  recipientPhone?: string;
  recipientBsuid?: string;
  templateName?: string;
  messageBody?: string;
  status: string;
  direction?: string;
  intent?: string;
  createdAt: Date;
  waMessageId?: string;
  errorMessage?: string;
  campaignType?: string;
}

interface OutboundMessageLogProps {
  logs: MessageLogRow[];
  totalCount: number;
  page: number;
  rowsPerPage: number;
  loading: boolean;
  warning: string | null;
  truncated: boolean;
  searchTerm: string;
  statusFilter: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
  onClearWarning: () => void;
  onDownload: () => void;
}

const OutboundMessageLog: React.FC<OutboundMessageLogProps> = ({
  logs,
  totalCount,
  page,
  rowsPerPage,
  loading,
  warning,
  truncated,
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusChange,
  onPageChange,
  onClearFilters,
  onClearWarning,
  onDownload,
}) => {
  const hasActiveFilters = Boolean(searchTerm || statusFilter !== 'all');

  return (
    <Card
      component="section"
      data-tour="whatsapp-metrics-logs"
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        boxShadow: 'none',
        '&:hover': { boxShadow: 'none', transform: 'none' },
      }}
    >
      <CardContent>
        {warning ? (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={onClearWarning}>
            {warning}
          </Alert>
        ) : null}
        {truncated ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            El registro está limitado a las 500 filas más recientes del periodo. Los KPIs
            superiores se calculan en el servidor y no usan este límite.
          </Alert>
        ) : null}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            mb: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ mr: 'auto' }}>
            <Typography component="h2" variant="subtitle1" fontWeight={700}>
              Registro de mensajes
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Evidencia de `whatsapp_message_log` · máximo 500 filas
            </Typography>
          </Box>
          <TextField
            size="small"
            label="Buscar teléfono o plantilla"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: { sm: 250 } }}
          />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel id="outbound-log-status-label">Estado</InputLabel>
            <Select
              labelId="outbound-log-status-label"
              value={statusFilter}
              label="Estado"
              onChange={(event) => onStatusChange(event.target.value)}
            >
              <MenuItem value="all">Todos</MenuItem>
              <MenuItem value="sent">Enviado</MenuItem>
              <MenuItem value="delivered">Entregado</MenuItem>
              <MenuItem value="read">Leído</MenuItem>
              <MenuItem value="failed">Fallido</MenuItem>
              <MenuItem value="received">Recibido</MenuItem>
            </Select>
          </FormControl>
          {hasActiveFilters ? (
            <Button size="small" startIcon={<FilterAltOffIcon />} onClick={onClearFilters}>
              Limpiar
            </Button>
          ) : null}
          <Button size="small" variant="outlined" onClick={onDownload}>
            Excel
          </Button>
        </Box>

        {loading ? (
          <Box role="status" aria-label="Cargando registro de mensajes" sx={{ display: 'grid', placeItems: 'center', py: 5 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <MetricsDataTable
            ariaLabel="Registro de mensajes outbound"
            count={totalCount}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={onPageChange}
            outlined
          >
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Destinatario</TableCell>
                <TableCell>Plantilla</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Dirección</TableCell>
                <TableCell>Campaña</TableCell>
                <TableCell>Error</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {log.createdAt.toLocaleString('es-CO', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {log.recipientPhone || log.recipientBsuid || '—'}
                  </TableCell>
                  <TableCell>{log.templateName || '—'}</TableCell>
                  <TableCell>
                    {log.direction === 'inbound'
                      ? '—'
                      : log.templateName
                        ? 'Plantilla'
                        : 'Sesión 24h'}
                  </TableCell>
                  <TableCell>
                    <Chip label={log.status} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{log.direction === 'inbound' ? 'Entrante' : 'Saliente'}</TableCell>
                  <TableCell>{log.campaignType || '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 200 }}>{log.errorMessage || '—'}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    No se encontraron mensajes.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </MetricsDataTable>
        )}
      </CardContent>
    </Card>
  );
};

export default OutboundMessageLog;
