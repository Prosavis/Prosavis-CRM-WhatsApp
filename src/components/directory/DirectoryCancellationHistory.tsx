import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Box, Chip, Stack, Typography } from '@mui/material';
import type { DirectoryCancellationIncident } from '@/utils/directoryWorkspace';
import { cancellationReasonLabel } from '@/utils/directoryWorkspace';

function fmtDate(value: string | null): string {
  if (!value) return '—';
  try {
    return format(new Date(value), "d MMM yyyy", { locale: es });
  } catch {
    return '—';
  }
}

export function DirectoryCancellationHistory({
  incidents,
  loading,
}: {
  incidents: DirectoryCancellationIncident[];
  loading?: boolean;
}) {
  if (loading) {
    return <Typography variant="body2" color="text.secondary">Cargando historial de cancelaciones…</Typography>;
  }
  if (incidents.length === 0) {
    return <Typography variant="body2" color="text.secondary">Sin cancelaciones ni rechazos.</Typography>;
  }
  return (
    <Stack spacing={1.25}>
      {incidents.map((incident) => (
        <Box key={incident.appointmentId} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.25 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={incident.status === 'REJECTED' ? 'Rechazada' : 'Cancelada'}
              color={incident.status === 'REJECTED' ? 'default' : 'warning'}
            />
            <Typography variant="caption" color="text.secondary">
              {fmtDate(incident.updatedAt ?? incident.scheduledStart)}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.75 }}>
            {cancellationReasonLabel(incident.reason)}
          </Typography>
          {incident.reasonOther ? (
            <Typography variant="body2" color="text.secondary">
              {incident.reasonOther}
            </Typography>
          ) : null}
        </Box>
      ))}
    </Stack>
  );
}
