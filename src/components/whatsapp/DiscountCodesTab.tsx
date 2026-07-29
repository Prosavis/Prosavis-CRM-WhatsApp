import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  alpha,
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
  InputAdornment,
  Skeleton,
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
  useTheme,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  DeleteForever as DeleteForeverIcon,
  Add as AddIcon,
  Edit as EditIcon,
  LocalOfferOutlined as OfferIcon,
  Percent as PercentIcon,
  AttachMoney as MoneyIcon,
  Inventory2Outlined as EmptyIcon,
} from '@mui/icons-material';
import { DesignTokens } from '@/constants/designSystem';
import {
  createDiscountCodeFn,
  listDiscountCodesFn,
  updateDiscountCodeFn,
  deleteDiscountCodeFn,
  permanentDeleteDiscountCodeFn,
  type DiscountCodeData,
  type DiscountCodeType,
} from '@/services/discountCodesService';
import {
  DISCOUNT_CODE_REGEX,
  isCreateDiscountFormValid,
  normalizeDiscountCode,
} from '@/utils/discountCodeValidation';

const AMOUNT_PRESETS = [5000, 10000, 15000, 20000];

const STATUS_META: Record<
  string,
  { label: string; bg: string; fg: string; border: string }
> = {
  active: {
    label: 'Activo',
    bg: alpha(DesignTokens.semantic.success, 0.12),
    fg: '#2e7d32',
    border: alpha(DesignTokens.semantic.success, 0.28),
  },
  redeemed: {
    label: 'Canjeado',
    bg: alpha(DesignTokens.semantic.info, 0.12),
    fg: '#1565c0',
    border: alpha(DesignTokens.semantic.info, 0.28),
  },
  deleted: {
    label: 'Eliminado',
    bg: alpha('#757575', 0.1),
    fg: '#616161',
    border: alpha('#757575', 0.22),
  },
};

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'redeemed', label: 'Canjeados' },
  { value: 'deleted', label: 'Eliminados' },
] as const;

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

const surfaceSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 2,
  bgcolor: 'background.paper',
  overflow: 'hidden',
} as const;

const DiscountCodesTab: React.FC = () => {
  const theme = useTheme();
  const brandBlue = DesignTokens.brand.primary.blue;
  const brandOrange = DesignTokens.brand.primary.orange;

  const [codes, setCodes] = useState<DiscountCodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<DiscountCodeType>('fixed_cop');
  const [amount, setAmount] = useState<number | ''>('');
  const [percent, setPercent] = useState<number | ''>('');
  const [singleUse, setSingleUse] = useState(true);
  const [oncePerUser, setOncePerUser] = useState(false);
  const [maxRedemptions, setMaxRedemptions] = useState<number | ''>(5);
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<DiscountCodeData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<DiscountCodeData | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState(false);

  const [editTarget, setEditTarget] = useState<DiscountCodeData | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editDiscountType, setEditDiscountType] = useState<DiscountCodeType>('fixed_cop');
  const [editAmount, setEditAmount] = useState<number | ''>('');
  const [editPercent, setEditPercent] = useState<number | ''>('');
  const [editOncePerUser, setEditOncePerUser] = useState(false);
  const [editMaxRedemptions, setEditMaxRedemptions] = useState<number | ''>(5);
  const [editDescription, setEditDescription] = useState('');
  const [editUpdating, setEditUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  const codeValid = DISCOUNT_CODE_REGEX.test(code);
  const amountValid = discountType === 'fixed_cop' && typeof amount === 'number' && amount > 0;
  const percentValid =
    discountType === 'percentage' && typeof percent === 'number' && percent >= 1 && percent <= 100;
  const redemptionsValid =
    oncePerUser ||
    singleUse ||
    (typeof maxRedemptions === 'number' && Number.isInteger(maxRedemptions) && maxRedemptions >= 2);

  const formValid = isCreateDiscountFormValid({
    code,
    discountType,
    amount,
    percent,
    oncePerUser,
    singleUse,
    maxRedemptions,
  });

  const activeCount = useMemo(
    () => codes.filter((c) => c.status === 'active').length,
    [codes]
  );

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
      if (oncePerUser) {
        params.oncePerUser = true;
      } else if (singleUse) {
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
      setOncePerUser(false);
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

  const handleEditOpen = (item: DiscountCodeData) => {
    setEditTarget(item);
    setEditCode(item.code);
    setEditDiscountType(item.discountType ?? 'fixed_cop');
    setEditAmount(item.discountType === 'fixed_cop' ? item.discountAmountCOP : '');
    setEditPercent(item.discountType === 'percentage' ? item.discountPercent ?? '' : '');
    setEditOncePerUser(item.oncePerUser === true);
    setEditMaxRedemptions(
      item.oncePerUser ? 5 : item.maxRedemptions != null ? item.maxRedemptions : 5,
    );
    setEditDescription(item.description ?? '');
    setEditError(null);
  };

  const handleEditSubmit = async () => {
    if (!editTarget) return;
    if (!DISCOUNT_CODE_REGEX.test(editCode)) return;
    setEditUpdating(true);
    setEditError(null);
    try {
      const params: Record<string, unknown> = {
        id: editTarget.id,
        code: editCode,
        discountType: editDiscountType,
        description: editDescription.trim() || null,
        oncePerUser: editOncePerUser,
      };
      if (editDiscountType === 'fixed_cop') {
        params.discountAmountCOP = editAmount;
      } else {
        params.discountPercent = editPercent;
      }
      if (!editOncePerUser && typeof editMaxRedemptions === 'number' && editMaxRedemptions >= 1) {
        params.maxRedemptions = editMaxRedemptions;
      }
      await updateDiscountCodeFn(params as any);
      setEditTarget(null);
      loadCodes();
    } catch (err: any) {
      setEditError(err?.details || err?.message || 'Error actualizando código');
    } finally {
      setEditUpdating(false);
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
    const used = item.redemptionCount ?? 0;
    if (item.oncePerUser) {
      return {
        primary: `${used} canje${used === 1 ? '' : 's'}`,
        modeLabel: '1 por usuario',
        modeHint: 'Cupo global ilimitado; cada cliente solo una vez',
      };
    }
    const max = item.maxRedemptions ?? 1;
    return {
      primary: `${used}/${max}`,
      modeLabel: max === 1 ? '1 global' : `Máx. ${max}`,
      modeHint:
        max === 1
          ? 'Un solo canje en total (cualquiera lo gasta)'
          : `Hasta ${max} canjes en total`,
    };
  };

  const typeToggleSx = {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: `${DesignTokens.borderRadius.md} !important`,
    overflow: 'hidden',
    bgcolor: alpha(brandBlue, theme.palette.mode === 'dark' ? 0.12 : 0.03),
    '& .MuiToggleButton-root': {
      textTransform: 'none',
      fontWeight: 500,
      px: 2,
      py: 0.75,
      border: 'none !important',
      borderRadius: `${DesignTokens.borderRadius.sm} !important`,
      color: 'text.secondary',
      gap: 0.75,
      transition: DesignTokens.transitions.fast,
      '&.Mui-selected': {
        bgcolor: brandBlue,
        color: '#fff',
        fontWeight: 600,
        boxShadow: DesignTokens.shadows.xs,
        '&:hover': {
          bgcolor: DesignTokens.brand.secondary.lightBlue,
        },
      },
      '&:hover': {
        bgcolor: alpha(brandBlue, 0.06),
      },
    },
  } as const;

  return (
    <Box sx={{ py: 2, maxWidth: 1280, mx: 'auto' }}>
      {/* ── Crear ── */}
      <Box sx={{ ...surfaceSx, mb: 3 }}>
        <Box
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: 2,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            background: `linear-gradient(135deg, ${alpha(brandBlue, theme.palette.mode === 'dark' ? 0.18 : 0.04)} 0%, ${alpha(brandOrange, theme.palette.mode === 'dark' ? 0.1 : 0.03)} 100%)`,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1.5,
              display: 'grid',
              placeItems: 'center',
              bgcolor: alpha(brandOrange, 0.14),
              color: brandOrange,
              flexShrink: 0,
            }}
          >
            <OfferIcon fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} letterSpacing="-0.01em">
              Crear código de descuento
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Genera cupones de monto fijo o porcentaje para canjear en pagos.
            </Typography>
          </Box>
          {!loading && (
            <Chip
              size="small"
              label={`${activeCount} activos`}
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                fontWeight: 600,
                bgcolor: alpha(DesignTokens.semantic.success, 0.12),
                color: '#2e7d32',
                border: `1px solid ${alpha(DesignTokens.semantic.success, 0.25)}`,
              }}
            />
          )}
        </Box>

        <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2.5 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography
                variant="caption"
                fontWeight={600}
                color="text.secondary"
                sx={{ display: 'block', mb: 1, letterSpacing: '0.04em', textTransform: 'uppercase' }}
              >
                Tipo de descuento
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={discountType}
                onChange={(_, v: DiscountCodeType | null) => {
                  if (v != null) setDiscountType(v);
                }}
                sx={typeToggleSx}
              >
                <ToggleButton value="fixed_cop">
                  <MoneyIcon sx={{ fontSize: 18 }} />
                  Monto fijo (COP)
                </ToggleButton>
                <ToggleButton value="percentage">
                  <PercentIcon sx={{ fontSize: 18 }} />
                  Porcentaje (%)
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: '1fr 1fr',
                  md: 'minmax(160px, 1.1fr) minmax(160px, 1.1fr) minmax(140px, 0.9fr) minmax(200px, 1.4fr)',
                },
                gap: 2,
                alignItems: 'start',
              }}
            >
              <TextField
                label="Código"
                value={code}
            onChange={(e) => setCode(normalizeDiscountCode(e.target.value))}
            inputProps={{ maxLength: 10, style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600, letterSpacing: '0.06em' } }}
            helperText={`${code.length}/10 · mín. 3, alfanumérico`}
            error={code.length > 0 && !codeValid}
                size="small"
                fullWidth
                placeholder="VERANO25"
              />

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
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Typography variant="body2" color="text.secondary" fontWeight={600}>
                            $
                          </Typography>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                    {AMOUNT_PRESETS.map((preset) => {
                      const selected = amount === preset;
                      return (
                        <Chip
                          key={preset}
                          label={`$${(preset / 1000).toFixed(0)}k`}
                          size="small"
                          onClick={() => setAmount(preset)}
                          sx={{
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            bgcolor: selected ? alpha(brandOrange, 0.14) : 'transparent',
                            color: selected ? DesignTokens.brand.secondary.darkOrange : 'text.secondary',
                            border: '1px solid',
                            borderColor: selected ? alpha(brandOrange, 0.45) : 'divider',
                            transition: DesignTokens.transitions.fast,
                            '&:hover': {
                              bgcolor: alpha(brandOrange, 0.1),
                              borderColor: alpha(brandOrange, 0.35),
                            },
                          }}
                        />
                      );
                    })}
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
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />
              )}

              <Box
                sx={{
                  px: 1.5,
                  py: 1.25,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: alpha(brandBlue, theme.palette.mode === 'dark' ? 0.08 : 0.02),
                  minHeight: 40,
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={oncePerUser}
                      onChange={(_, c) => {
                        setOncePerUser(c);
                        if (c) setSingleUse(false);
                      }}
                      size="small"
                      sx={{
                        color: brandBlue,
                        '&.Mui-checked': { color: brandOrange },
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        Una vez por usuario
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Ilimitado en total; cada cliente 1 vez
                      </Typography>
                    </Box>
                  }
                  sx={{ m: 0, alignItems: 'flex-start' }}
                />
                {!oncePerUser && (
                  <>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={singleUse}
                          onChange={(_, c) => setSingleUse(c)}
                          size="small"
                          sx={{
                            color: brandBlue,
                            '&.Mui-checked': { color: brandOrange },
                          }}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            Único uso
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            1 canje en total (global)
                          </Typography>
                        </Box>
                      }
                      sx={{ m: 0, mt: 0.75, alignItems: 'flex-start' }}
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
                        helperText="Tope global (mín. 2). Cualquier usuario puede gastarlos."
                        error={!singleUse && !redemptionsValid}
                        sx={{ mt: 1 }}
                      />
                    )}
                  </>
                )}
                {oncePerUser && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                    No hay tope global: el código sigue activo; cada usuario de la app (o web) solo puede usarlo una vez.
                  </Typography>
                )}
              </Box>

              <TextField
                label="Descripción (opcional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                size="small"
                fullWidth
                placeholder="Campaña, canal o nota interna"
              />
            </Box>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              justifyContent="space-between"
            >
              <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 420 }}>
                El código se valida en mayúsculas. Los cupones activos pueden editarse o eliminarse
                desde la lista.
              </Typography>
              <Button
                variant="contained"
                startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
                onClick={handleCreate}
                disabled={!formValid || creating}
                sx={{
                  alignSelf: { xs: 'stretch', sm: 'flex-end' },
                  minWidth: 140,
                  fontWeight: 700,
                  textTransform: 'none',
                  px: 2.5,
                  boxShadow: 'none',
                  bgcolor: brandOrange,
                  '&:hover': { bgcolor: DesignTokens.brand.secondary.darkOrange, boxShadow: DesignTokens.shadows.sm },
                  '&.Mui-disabled': {
                    bgcolor: alpha(brandOrange, 0.35),
                    color: '#fff',
                  },
                }}
              >
                Crear
              </Button>
            </Stack>

            {createError && <Alert severity="error">{createError}</Alert>}
            {createSuccess && <Alert severity="success">{createSuccess}</Alert>}
          </Stack>
        </Box>
      </Box>

      {/* ── Lista ── */}
      <Box sx={surfaceSx}>
        <Box
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: 1.75,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={700} letterSpacing="-0.01em">
              Códigos
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {loading ? 'Cargando…' : `${codes.length} resultado${codes.length === 1 ? '' : 's'}`}
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {FILTERS.map((f) => {
              const selected = statusFilter === f.value;
              return (
                <Chip
                  key={f.value}
                  label={f.label}
                  size="small"
                  clickable
                  onClick={() => setStatusFilter(f.value)}
                  sx={{
                    fontWeight: selected ? 700 : 500,
                    bgcolor: selected ? brandBlue : 'transparent',
                    color: selected ? '#fff' : 'text.secondary',
                    border: '1px solid',
                    borderColor: selected ? brandBlue : 'divider',
                    transition: DesignTokens.transitions.fast,
                    '&:hover': {
                      bgcolor: selected ? DesignTokens.brand.secondary.lightBlue : alpha(brandBlue, 0.06),
                    },
                  }}
                />
              );
            })}
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" sx={{ m: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <TableContainer sx={{ maxWidth: '100%' }}>
          <Table size="small" sx={{ minWidth: 960 }}>
            <TableHead>
              <TableRow
                sx={{
                  '& .MuiTableCell-head': {
                    bgcolor: theme.palette.mode === 'dark' ? alpha('#fff', 0.03) : alpha(brandBlue, 0.03),
                    color: 'text.secondary',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    py: 1.25,
                    whiteSpace: 'nowrap',
                  },
                }}
              >
                <TableCell>Código</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Valor</TableCell>
                <TableCell>Usos</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Creación</TableCell>
                <TableCell>Canje</TableCell>
                <TableCell>Canjeado por</TableCell>
                <TableCell>Pago</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 11 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton variant="rounded" height={18} sx={{ maxWidth: j === 0 ? 88 : 72 }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : codes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} sx={{ py: 0, border: 0 }}>
                    <Box
                      sx={{
                        py: 7,
                        px: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        gap: 1.25,
                      }}
                    >
                      <Box
                        sx={{
                          width: 56,
                          height: 56,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: alpha(brandBlue, 0.06),
                          color: alpha(brandBlue, 0.55),
                          mb: 0.5,
                        }}
                      >
                        <EmptyIcon />
                      </Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        No hay códigos de descuento
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
                        {statusFilter === 'all'
                          ? 'Crea el primero arriba: elige tipo, define el valor y pulsa Crear.'
                          : 'No hay resultados con este filtro. Prueba con Todos o Activos.'}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                codes.map((item) => {
                  const meta = STATUS_META[item.status] ?? STATUS_META.active;
                  const tipoLabel =
                    item.discountType === 'percentage' ? 'Porcentaje' : 'Monto fijo';
                  return (
                    <TableRow
                      key={item.id}
                      hover
                      sx={{
                        transition: DesignTokens.transitions.fast,
                        '&:hover': {
                          bgcolor: alpha(brandBlue, theme.palette.mode === 'dark' ? 0.08 : 0.025),
                        },
                        '& .MuiTableCell-root': {
                          borderColor: alpha(theme.palette.divider, 0.7),
                          py: 1.35,
                        },
                      }}
                    >
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Box
                            component="span"
                            sx={{
                              px: 1,
                              py: 0.35,
                              borderRadius: 1,
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              fontWeight: 700,
                              fontSize: '0.8125rem',
                              letterSpacing: '0.04em',
                              bgcolor: alpha(brandBlue, theme.palette.mode === 'dark' ? 0.18 : 0.06),
                              color: theme.palette.mode === 'dark' ? '#90caf9' : brandBlue,
                              border: '1px solid',
                              borderColor: alpha(brandBlue, 0.12),
                            }}
                          >
                            {item.code}
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {tipoLabel}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          sx={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatValueCell(item)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const uses = formatUsesCell(item);
                          return (
                            <Stack spacing={0.5} alignItems="flex-start">
                              <Typography
                                variant="body2"
                                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                                fontWeight={700}
                                sx={{ fontVariantNumeric: 'tabular-nums' }}
                              >
                                {uses.primary}
                              </Typography>
                              <Chip
                                label={uses.modeLabel}
                                size="small"
                                title={uses.modeHint}
                                sx={{
                                  height: 22,
                                  fontWeight: 600,
                                  fontSize: '0.65rem',
                                  bgcolor: item.oncePerUser
                                    ? alpha(brandOrange, 0.12)
                                    : alpha(brandBlue, 0.08),
                                  color: item.oncePerUser
                                    ? DesignTokens.brand.secondary.darkOrange
                                    : brandBlue,
                                  border: '1px solid',
                                  borderColor: item.oncePerUser
                                    ? alpha(brandOrange, 0.35)
                                    : alpha(brandBlue, 0.2),
                                }}
                              />
                            </Stack>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={meta.label}
                          size="small"
                          sx={{
                            height: 24,
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            bgcolor: meta.bg,
                            color: meta.fg,
                            border: `1px solid ${meta.border}`,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          noWrap
                          sx={{ maxWidth: 200 }}
                          title={item.description || undefined}
                        >
                          {item.description || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" whiteSpace="nowrap">
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString('es-CO', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          noWrap
                          title={item.redeemedAt ?? undefined}
                        >
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
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                          fontSize="0.75rem"
                        >
                          {item.redeemedBy || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                          fontSize="0.7rem"
                          noWrap
                          sx={{ maxWidth: 120 }}
                          title={item.paymentId}
                        >
                          {item.paymentId ? `${item.paymentId.slice(0, 6)}…` : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0} justifyContent="flex-end">
                          <Tooltip title="Copiar código">
                            <IconButton
                              size="small"
                              onClick={() => handleCopy(item.code)}
                              sx={{
                                color: 'text.secondary',
                                '&:hover': { color: brandBlue, bgcolor: alpha(brandBlue, 0.08) },
                              }}
                            >
                              <CopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {item.status === 'active' && (
                            <Tooltip title="Editar">
                              <IconButton
                                size="small"
                                onClick={() => handleEditOpen(item)}
                                sx={{
                                  color: 'text.secondary',
                                  '&:hover': { color: brandBlue, bgcolor: alpha(brandBlue, 0.08) },
                                }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {item.status === 'active' && (
                            <Tooltip title="Eliminar">
                              <IconButton
                                size="small"
                                onClick={() => setDeleteTarget(item)}
                                sx={{
                                  color: 'text.secondary',
                                  '&:hover': {
                                    color: DesignTokens.semantic.error,
                                    bgcolor: alpha(DesignTokens.semantic.error, 0.08),
                                  },
                                }}
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
      </Box>

      {/* ── Diálogo: Soft delete ── */}
      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle fontWeight={700}>Eliminar código</DialogTitle>
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
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting} sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Diálogo: Eliminación permanente ── */}
      <Dialog
        open={!!permanentDeleteTarget}
        onClose={() => !permanentDeleting && setPermanentDeleteTarget(null)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle fontWeight={700}>Eliminar definitivamente</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Estás seguro de que deseas eliminar <strong>definitivamente</strong> el código{' '}
            <strong>{permanentDeleteTarget?.code}</strong>?
            <br />
            <br />
            Esta acción <strong>no se puede deshacer</strong>. El código será removido permanentemente
            y podrás crear uno nuevo con el mismo nombre.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setPermanentDeleteTarget(null)}
            disabled={permanentDeleting}
            sx={{ textTransform: 'none' }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handlePermanentDelete}
            color="error"
            variant="contained"
            disabled={permanentDeleting}
            startIcon={
              permanentDeleting ? <CircularProgress size={16} color="inherit" /> : <DeleteForeverIcon />
            }
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Eliminar definitivamente
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Diálogo: Editar código ── */}
      <Dialog
        open={!!editTarget}
        onClose={() => !editUpdating && setEditTarget(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle fontWeight={700}>Editar código: {editTarget?.code}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Código"
              value={editCode}
              onChange={(e) => setEditCode(normalizeDiscountCode(e.target.value))}
              inputProps={{
                maxLength: 10,
                style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600 },
              }}
              error={editCode.length > 0 && !DISCOUNT_CODE_REGEX.test(editCode)}
              helperText={`${editCode.length}/10 caracteres alfanuméricos`}
              size="small"
              fullWidth
            />
            <Box>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Tipo de descuento
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={editDiscountType}
                onChange={(_, v: DiscountCodeType | null) => {
                  if (v != null) setEditDiscountType(v);
                }}
                sx={typeToggleSx}
              >
                <ToggleButton value="fixed_cop">Monto fijo (COP)</ToggleButton>
                <ToggleButton value="percentage">Porcentaje (%)</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {editDiscountType === 'fixed_cop' ? (
              <TextField
                label="Monto (COP)"
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value ? Number(e.target.value) : '')}
                size="small"
                fullWidth
                error={editAmount !== '' && (typeof editAmount !== 'number' || editAmount <= 0)}
              />
            ) : (
              <TextField
                label="Porcentaje (1–100)"
                type="number"
                value={editPercent}
                onChange={(e) => setEditPercent(e.target.value ? Number(e.target.value) : '')}
                size="small"
                fullWidth
                inputProps={{ min: 1, max: 100 }}
                error={
                  editPercent !== '' &&
                  (typeof editPercent !== 'number' || editPercent < 1 || editPercent > 100)
                }
              />
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={editOncePerUser}
                  onChange={(_, c) => setEditOncePerUser(c)}
                  size="small"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    Una vez por usuario
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Ilimitado en total; cada cliente 1 vez
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start' }}
            />
            {!editOncePerUser && (
              <TextField
                label="Máx. canjes (global)"
                type="number"
                size="small"
                fullWidth
                value={editMaxRedemptions}
                onChange={(e) => setEditMaxRedemptions(e.target.value ? Number(e.target.value) : '')}
                inputProps={{ min: 1 }}
                helperText="1 = único uso global. Cualquier cliente puede gastar el cupo."
              />
            )}
            {editOncePerUser && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                Configurado bien: sin tope global. Cada usuario autenticado solo puede canjearlo una vez.
              </Alert>
            )}
            <TextField
              label="Descripción (opcional)"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              size="small"
              fullWidth
            />
          </Stack>
          {editError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {editError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditTarget(null)} disabled={editUpdating} sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button
            onClick={handleEditSubmit}
            variant="contained"
            disabled={editUpdating || !DISCOUNT_CODE_REGEX.test(editCode)}
            startIcon={editUpdating ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              bgcolor: brandOrange,
              '&:hover': { bgcolor: DesignTokens.brand.secondary.darkOrange },
            }}
          >
            Guardar cambios
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DiscountCodesTab;
