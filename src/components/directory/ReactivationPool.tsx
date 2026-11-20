import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Drawer,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  holdReactivation,
  listReactivationCandidates,
  REACTIVATION_SEGMENTS,
  setReactivationContactType,
  type ReactivationCandidate,
} from '@/services/reactivationCandidatesService';

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function day(value: string | null): string {
  if (!value) return '—';
  return value.slice(0, 10);
}

export function ReactivationPool() {
  const [segment, setSegment] = useState<string>('VIP');
  const [rows, setRows] = useState<ReactivationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReactivationCandidate | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [tipo, setTipo] = useState('cliente');
  const [notice, setNotice] = useState<string | null>(null);

  const load = async (next = segment) => {
    setLoading(true);
    setError(null);
    try {
      const items = await listReactivationCandidates({
        segmentos: [next],
        limit: 50,
        eligibleOnly: true,
      });
      setRows(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el segmento.');
    } finally {
      setLoading(false);
    }
  };

  const exclude = async () => {
    if (!selected || !holdReason.trim()) return;
    await holdReactivation(selected.phone_key, holdReason.trim());
    setNotice('Quedó fuera de las próximas campañas.');
    setSelected(null);
    setHoldReason('');
    await load();
  };

  const correctType = async () => {
    if (!selected) return;
    await setReactivationContactType(selected.phone_key, tipo);
    setNotice(`Tipo actualizado a ${tipo}.`);
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }} alignItems={{ sm: 'center' }}>
        <TextField
          select
          size="small"
          label="Segmento"
          value={segment}
          onChange={(event) => setSegment(event.target.value)}
          sx={{ minWidth: 160 }}
        >
          {REACTIVATION_SEGMENTS.map((item) => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" onClick={() => void load()} disabled={loading}>
          {loading ? 'Cargando…' : 'Ver segmento'}
        </Button>
        <Typography variant="body2" color="text.secondary">
          El envío del lote lo hace la tool del Hub, con la orden del día. Esta pantalla no manda mensajes.
        </Typography>
      </Stack>
      {error ? <Typography color="error">{error}</Typography> : null}
      {notice ? <Typography color="primary">{notice}</Typography> : null}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell>Teléfono</TableCell>
            <TableCell>Prioridad</TableCell>
            <TableCell>Servicios</TableCell>
            <TableCell>LTV</TableCell>
            <TableCell>Ritmo</TableCell>
            <TableCell>Le toca</TableCell>
            <TableCell>312</TableCell>
            <TableCell>311</TableCell>
            <TableCell>Plantilla</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.phone_key} hover onClick={() => setSelected(row)} sx={{ cursor: 'pointer' }}>
              <TableCell>{row.display_name || '—'}</TableCell>
              <TableCell>{row.dial_phone || '—'}</TableCell>
              <TableCell>{row.priority}</TableCell>
              <TableCell>{row.done_count ?? 0}</TableCell>
              <TableCell>{row.ltv_cop ? money.format(row.ltv_cop) : '—'}</TableCell>
              <TableCell>{row.cadence_days ? `${row.cadence_days} días` : '—'}</TableCell>
              <TableCell>{day(row.next_due)}</TableCell>
              <TableCell>{day(row.last_312)}</TableCell>
              <TableCell>{day(row.last_311)}</TableCell>
              <TableCell>{row.template_name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && !loading ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          Elige un segmento y pulsa Ver segmento.
        </Typography>
      ) : null}
      <Drawer anchor="right" open={selected != null} onClose={() => setSelected(null)}>
        {selected ? (
          <Box sx={{ width: { xs: '100vw', sm: 420 }, p: 2 }}>
            <Typography variant="h6">{selected.display_name || selected.phone_key}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {selected.dial_phone} · {selected.segment} · {selected.angle}
            </Typography>
            {selected.sensitive ? <Chip size="small" label={selected.handler ? `Revisa ${selected.handler}` : 'Sensible'} sx={{ mb: 1 }} /> : null}
            {selected.phone_needs_review ? <Chip size="small" color="warning" label="Revisar teléfono" sx={{ mb: 1, ml: 1 }} /> : null}
            <Typography variant="subtitle2">Contexto</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>{selected.context || 'Sin cajón ni resumen de Sofía.'}</Typography>
            <Typography variant="subtitle2">Borrador</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {selected.template_name}: {selected.var1 || 'de nuevo'}
              {selected.var2 ? ` — ${selected.var2}` : ''}
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              label="Tipo de contacto"
              value={tipo}
              onChange={(event) => setTipo(event.target.value)}
              sx={{ mb: 1 }}
            >
              <MenuItem value="cliente">Cliente</MenuItem>
              <MenuItem value="posible_cliente">Posible cliente</MenuItem>
              <MenuItem value="empresa">Empresa</MenuItem>
              <MenuItem value="auxiliar">Auxiliar</MenuItem>
            </TextField>
            <Button variant="outlined" onClick={() => void correctType()} sx={{ mb: 2 }}>
              Corregir tipo
            </Button>
            <TextField
              fullWidth
              size="small"
              label="Motivo para excluir de campañas"
              value={holdReason}
              onChange={(event) => setHoldReason(event.target.value)}
              sx={{ mb: 1 }}
            />
            <Button color="warning" variant="contained" disabled={!holdReason.trim()} onClick={() => void exclude()}>
              Excluir de campañas
            </Button>
          </Box>
        ) : null}
      </Drawer>
    </Box>
  );
}
