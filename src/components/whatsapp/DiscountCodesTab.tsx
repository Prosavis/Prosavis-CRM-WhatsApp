import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  Alert,
  Divider,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  DeleteForever as DeleteForeverIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import {
  createDiscountCodeFn,
  listDiscountCodesFn,
  deleteDiscountCodeFn,
  permanentDeleteDiscountCodeFn,
  type DiscountCodeData,
  type DiscountCodeType,
} from '@/services/discountCodesService';

const CODE_REGEX = /^[A-Z0-9]{3,10}$/;
const AMOUNT_PRESETS = [5000, 10000, 15000, 20000];

const STATUS_CHIP: Record<string, { label: string; color: 'success' | 'info' | 'default' }> = {
  active: { label: 'Activo', color: 'success' },
  redeemed: { label: 'Canjeado', color: 'info' },
  deleted: { label: 'Eliminado', color: 'default' },
};

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

const DiscountCodesTab: React.FC = () => {
  const [codes, setCodes] = useState<DiscountCodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<DiscountCodeType>('fixed_cop');
  const [amount, setAmount] = useState<number | ''>('');
  const [percent, setPercent] = useState<number | ''>('');
  const [singleUse, setSingleUse] = useState(true);
  const [maxRedemptions, setMaxRedemptions] = useState<number | ''>(5);
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<DiscountCodeData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<DiscountCodeData | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState(false);

  const loadCodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listDiscountCodesFn(
        statusFilter !== 'all' ? { status: statusFilter } : undefined
      );
      setCodes(result.codes);
    } catch (err: any) {
      const msg = err?.details || err?.message || 'Error cargando códigos';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const codeValid = CODE_REGEX.test(code);
  const amountValid = discountType === 'fixed_cop' && typeof amount === 'number' && amount > 0;
  const percentValid =
    discountType === 'percentage' && typeof percent === 'number' && percent >= 1 && percent <= 100;
  const redemptionsValid =
    singleUse ||
    (typeof maxRedemptions === 'number' && Number.isInteger(maxRedemptions) && maxRedemptions >= 2);

  const formValid = codeValid && (amountValid || percentValid) && redemptionsValid;

  const handleCreate = async () => {
    if (!formValid) return;
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const params: Parameters<typeof createDiscountCodeFn>[0] = {
        code,
        discountType,
        description: description.trim() || undefined,
      };
      if (discountType === 'fixed_cop') {
        params.discountAmountCOP = amount as number;
      } else {
        params.discountPercent = percent as number;
      }
      if (singleUse) {
        params.singleUse = true;
      } else {
        params.maxRedemptions = maxRedemptions as number;
      }

      const result = await createDiscountCodeFn(params);
      const valueLabel =
        result.discountType === 'percentage'
          ? `${result.discountPercent ?? percent}%`
          : fmtCOP(result.discountAmountCOP);
      setCreateSuccess(`Código "${result.code}" creado (${valueLabel})`);
      setCode('');
      setAmount('');
      setPercent('');
      setDescription('');
      setSingleUse(true);
      setMaxRedemptions(5);
      setDiscountType('fixed_cop');
      loadCodes();
    } catch (err: any) {
      setCreateError(err?.details || err?.message || 'Error creando código');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDiscountCodeFn(deleteTarget.id);
      setDeleteTarget(null);
      loadCodes();
    } catch (err: any) {
      setError(err?.details || err?.message || 'Error eliminando código');
    } finally {
      setDeleting(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteTarget) return;
    setPermanentDeleting(true);
    try {
      await permanentDeleteDiscountCodeFn(permanentDeleteTarget.id);
      setPermanentDeleteTarget(null);
      loadCodes();
    } catch (err: any) {
      setError(err?.details || err?.message || 'Error eliminando definitivamente');
    } finally {
      setPermanentDeleting(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatValueCell = (item: DiscountCodeData) => {
    if (item.discountType === 'percentage') {
      return `${item.discountPercent ?? '—'}%`;
    }
    return fmtCOP(item.discountAmountCOP ?? 0);
  };

  const formatUsesCell = (item: DiscountCodeData) => {
    const max = item.maxRedemptions ?? 1;
    const used = item.redemptionCount ?? 0;
    return `${used}/${max}`;
  };

  return (
    <Box>
      {/* ── Formulario de creación ── */}
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          Crear código de descuento
        </Typography>

        {/* Fila 1: Tipo de descuento */}
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
            Tipo de descuento
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={discountType}
            onChange={(_, v: DiscountCodeType | null) => {
              if (v != null) setDiscountType(v);
            }}
          >
            <ToggleButton value="fixed_cop">Monto fijo (COP)</ToggleButton>
            <ToggleButton value="percentage">Porcentaje (%)</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {/* Fila 2: Campos del formulario en grid uniforme */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: '1fr 1fr',
              md: 'minmax(150px, 1fr) minmax(150px, 1fr) auto minmax(200px, 1.5fr)',
            },
            gap: 2,
            alignItems: 'start',
          }}
        >
          {/* Código */}
          <TextField
            label="Código"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            inputProps={{ maxLength: 10 }}
            helperText={`${code.length}/10 caracteres (mín. 3, alfanumérico)`}
            error={code.length > 0 && !codeValid}
            size="small"
            fullWidth
          />

          {/* Valor (monto o porcentaje) */}
          {discountType === 'fixed_cop' ? (
            <Box>
              <TextField
                label="Monto (COP)"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                size="small"
                fullWidth
                error={amount !== '' && !amountValid}
              />
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                {AMOUNT_PRESETS.map((preset) => (
                  <Chip
                    key={preset}
                    label={`$${(preset / 1000).toFixed(0)}k`}
                    size="small"
                    variant={amount === preset ? 'filled' : 'outlined'}
                    color={amount === preset ? 'primary' : 'default'}
                    onClick={() => setAmount(preset)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Stack>
            </Box>
          ) : (
            <TextField
              label="Porcentaje (1–100)"
              type="number"
              value={percent}
              onChange={(e) => setPercent(e.target.value ? Number(e.target.value) : '')}
              size="small"
              fullWidth
              inputProps={{ min: 1, max: 100 }}
              error={percent !== '' && !percentValid}
            />
          )}

          {/* Uso / Máx. canjes */}
          <Box sx={{ minWidth: 140 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={singleUse}
                  onChange={(_, c) => setSingleUse(c)}
                  size="small"
                />
              }
              label="Único uso"
              sx={{ whiteSpace: 'nowrap' }}
            />
            {!singleUse && (
              <TextField
                label="Máx. canjes"
                type="number"
                size="small"
                fullWidth
                value={maxRedemptions}
                onChange={(e) =>
                  setMaxRedemptions(e.target.value ? Number(e.target.value) : '')
                }
                inputProps={{ min: 2 }}
                helperText="Mínimo 2 si no es único uso"
                error={!singleUse && !redemptionsValid}
              />
            )}
          </Box>

          {/* Descripción */}
          <TextField
            label="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
            fullWidth
          />
        </Box>

        {/* Botón crear */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button
            variant="contained"
            startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
            onClick={handleCreate}
            disabled={!formValid || creating}
          >
            Crear
          </Button>
        </Box>

        {createError && <Alert severity="error" sx={{ mt: 1.5 }}>{createError}</Alert>}
        {createSuccess && <Alert severity="success" sx={{ mt: 1.5 }}>{createSuccess}</Alert>}
      </Paper>

      {/* ── Filtros ── */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
        <Typography variant="subtitle2">Filtrar:</Typography>
        <ToggleButtonGroup
          size="small"
          value={statusFilter}
          exclusive
          onChange={(_, v) => {
            if (v != null) setStatusFilter(v);
          }}
        >
          <ToggleButton value="all">Todos</ToggleButton>
          <ToggleButton value="active">Activos</ToggleButton>
          <ToggleButton value="redeemed">Canjeados</ToggleButton>
          <ToggleButton value="deleted">Eliminados</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Tabla ── */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Código</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Valor</TableCell>
              <TableCell>Usos</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Descripción</TableCell>
              <TableCell>Fecha creación</TableCell>
              <TableCell>Fecha canje</TableCell>
              <TableCell>Canjeado por</TableCell>
              <TableCell>Pago</TableCell>
              <TableCell align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : codes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No hay códigos de descuento
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              codes.map((item) => {
                const chip = STATUS_CHIP[item.status] ?? STATUS_CHIP.active;
                const tipoLabel =
                  item.discountType === 'percentage' ? 'Porcentaje' : 'Monto fijo';
                return (
                  <TableRow key={item.id} hover>
                    <TableCell>
                      <Typography fontFamily="monospace" fontWeight={600}>
                        {item.code}
                      </Typography>
                    </TableCell>
                    <TableCell>{tipoLabel}</TableCell>
                    <TableCell>{formatValueCell(item)}</TableCell>
                    <TableCell>{formatUsesCell(item)}</TableCell>
                    <TableCell>
                      <Chip label={chip.label} color={chip.color} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                        {item.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" noWrap title={item.redeemedAt ?? undefined}>
                        {item.redeemedAt
                          ? new Date(item.redeemedAt).toLocaleString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" fontFamily="monospace" fontSize="0.75rem">
                        {item.redeemedBy || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" fontFamily="monospace" fontSize="0.7rem" noWrap sx={{ maxWidth: 120 }} title={item.paymentId}>
                        {item.paymentId ? `${item.paymentId.slice(0, 6)}…` : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0} justifyContent="flex-end">
                        <Tooltip title="Copiar código">
                          <IconButton size="small" onClick={() => handleCopy(item.code)}>
                            <CopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {item.status === 'active' && (
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeleteTarget(item)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {item.status === 'deleted' && (
                          <Tooltip title="Eliminar definitivamente">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setPermanentDeleteTarget(item)}
                            >
                              <DeleteForeverIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Diálogo: Soft delete ── */}
      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)}>
        <DialogTitle>Eliminar código</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Seguro que deseas eliminar el código <strong>{deleteTarget?.code}</strong> (
            {deleteTarget
              ? deleteTarget.discountType === 'percentage'
                ? `${deleteTarget.discountPercent ?? '—'}%`
                : fmtCOP(deleteTarget.discountAmountCOP)
              : ''}
            )? El código quedará en estado eliminado y podrás borrarlo definitivamente después.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Diálogo: Eliminación permanente ── */}
      <Dialog open={!!permanentDeleteTarget} onClose={() => !permanentDeleting && setPermanentDeleteTarget(null)}>
        <DialogTitle>Eliminar definitivamente</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Estás seguro de que deseas eliminar <strong>definitivamente</strong> el código{' '}
            <strong>{permanentDeleteTarget?.code}</strong>?
            <br /><br />
            Esta acción <strong>no se puede deshacer</strong>. El código será removido permanentemente
            y podrás crear uno nuevo con el mismo nombre.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPermanentDeleteTarget(null)} disabled={permanentDeleting}>
            Cancelar
          </Button>
          <Button
            onClick={handlePermanentDelete}
            color="error"
            variant="contained"
            disabled={permanentDeleting}
            startIcon={permanentDeleting ? <CircularProgress size={16} color="inherit" /> : <DeleteForeverIcon />}
          >
            Eliminar definitivamente
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DiscountCodesTab;
