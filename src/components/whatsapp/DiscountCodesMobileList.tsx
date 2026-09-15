import {
  Box,
  Chip,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import EditIcon from '@mui/icons-material/Edit';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import type { DiscountCodeData } from '@/services/discountCodesService';

const STATUS_LABELS: Record<DiscountCodeData['status'], string> = {
  active: 'Activo',
  redeemed: 'Canjeado',
  deleted: 'Eliminado',
};

function formatValue(item: DiscountCodeData): string {
  if (item.discountType === 'percentage') return `${item.discountPercent ?? '—'}%`;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(item.discountAmountCOP ?? 0);
}

interface DiscountCodesMobileListProps {
  codes: DiscountCodeData[];
  loading: boolean;
  onCopy: (code: string) => void;
  onEdit: (item: DiscountCodeData) => void;
  onDelete: (item: DiscountCodeData) => void;
  onPermanentDelete: (item: DiscountCodeData) => void;
}

export default function DiscountCodesMobileList({
  codes,
  loading,
  onCopy,
  onEdit,
  onDelete,
  onPermanentDelete,
}: DiscountCodesMobileListProps) {
  if (loading) {
    return (
      <Stack spacing={1} sx={{ p: 1.5 }}>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} variant="rounded" height={132} />
        ))}
      </Stack>
    );
  }

  if (codes.length === 0) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ px: 2, py: 6, textAlign: 'center' }}>
        <LocalOfferOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
        <Typography fontWeight={700}>No hay códigos con este filtro</Typography>
        <Typography variant="body2" color="text.secondary">
          Prueba con Todos o crea un código nuevo.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack component="ul" spacing={1} sx={{ p: 1, m: 0, listStyle: 'none' }}>
      {codes.map((item) => {
        const used = item.redemptionCount ?? 0;
        const usage = item.oncePerUser
          ? `${used} canje${used === 1 ? '' : 's'} · 1 por usuario`
          : `${used}/${item.maxRedemptions ?? 1} usos`;
        return (
          <Box
            component="li"
            key={item.id}
            sx={{
              p: 1.5,
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Stack direction="row" alignItems="flex-start" spacing={1}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography
                    fontWeight={800}
                    sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  >
                    {item.code}
                  </Typography>
                  <Chip
                    size="small"
                    label={STATUS_LABELS[item.status]}
                    color={item.status === 'active' ? 'success' : item.status === 'redeemed' ? 'info' : 'default'}
                  />
                </Stack>
                <Typography variant="h6" sx={{ mt: 0.5 }}>
                  {formatValue(item)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {usage}
                </Typography>
                {item.description ? (
                  <Typography variant="body2" sx={{ mt: 0.75 }}>
                    {item.description}
                  </Typography>
                ) : null}
              </Box>
            </Stack>

            <Stack direction="row" justifyContent="flex-end" spacing={0.5} sx={{ mt: 1 }}>
              <IconButton
                aria-label={`Copiar código ${item.code}`}
                onClick={() => onCopy(item.code)}
                sx={{ width: 44, height: 44 }}
              >
                <ContentCopyIcon />
              </IconButton>
              {item.status === 'active' ? (
                <>
                  <IconButton
                    aria-label={`Editar código ${item.code}`}
                    onClick={() => onEdit(item)}
                    sx={{ width: 44, height: 44 }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    aria-label={`Eliminar código ${item.code}`}
                    onClick={() => onDelete(item)}
                    sx={{ width: 44, height: 44 }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </>
              ) : null}
              {item.status === 'deleted' ? (
                <IconButton
                  aria-label={`Eliminar definitivamente ${item.code}`}
                  color="error"
                  onClick={() => onPermanentDelete(item)}
                  sx={{ width: 44, height: 44 }}
                >
                  <DeleteForeverIcon />
                </IconButton>
              ) : null}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
