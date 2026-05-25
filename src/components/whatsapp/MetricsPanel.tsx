import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  ErrorOutlined as ErrorOutlineIcon,
  MarkEmailRead as MarkEmailReadIcon,
  Reply as ReplyIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { WHATSAPP_CAMPAIGN_LABELS } from '@/constants/whatsapp';
import type { WhatsAppMetrics } from '@/types/whatsapp';

interface MetricsPanelProps {
  metrics?: WhatsAppMetrics;
  loading: boolean;
  error?: string;
  days: number;
  onDaysChange: (days: number) => void;
}

const cards = [
  {
    key: 'totalSent',
    label: 'Enviados',
    icon: <SendIcon />,
    color: '#075e54',
  },
  {
    key: 'reachedDevice',
    label: 'En dispositivo',
    icon: <MarkEmailReadIcon />,
    color: '#00a884',
  },
  {
    key: 'totalResponses',
    label: 'Respuestas',
    icon: <ReplyIcon />,
    color: '#f59e0b',
  },
  {
    key: 'totalFailed',
    label: 'Fallidos',
    icon: <ErrorOutlineIcon />,
    color: '#ef4444',
  },
] as const;

export default function MetricsPanel({
  metrics,
  loading,
  error,
  days,
  onDaysChange,
}: MetricsPanelProps) {
  const campaignData = Object.entries(metrics?.byCampaign ?? {}).map(
    ([campaign, values]) => ({
      name: WHATSAPP_CAMPAIGN_LABELS[campaign] ?? campaign,
      enviados: values.sent,
      leidos: values.read,
      fallidos: values.failed,
    }),
  );

  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', md: 'center' },
        }}
      >
        <Box>
          <Typography variant="h5">Metricas de WhatsApp</Typography>
          <Typography color="text.secondary">
            Agregadas desde `whatsapp_message_log`; leads queda en cero en Fase 1.
          </Typography>
        </Box>
        <TextField
          select
          label="Periodo"
          value={days}
          onChange={(event) => onDaysChange(Number(event.target.value))}
          sx={{ minWidth: 180 }}
        >
          {[7, 30, 60, 90].map((option) => (
            <MenuItem key={option} value={option}>
              Ultimos {option} dias
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 260 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
            {cards.map((card) => (
              <Box key={card.key}>
                <Card>
                  <CardContent>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <Box
                        sx={{
                          width: 44,
                          height: 44,
                          borderRadius: '16px',
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: `${card.color}1a`,
                          color: card.color,
                        }}
                      >
                        {card.icon}
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          {card.label}
                        </Typography>
                        <Typography variant="h5">
                          {metrics?.[card.key] ?? 0}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            ))}
          </Box>

          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
                <BarChartIcon color="primary" />
                <Typography variant="h6">Campanas y estados</Typography>
              </Stack>
              <Box sx={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="enviados" fill="#075e54" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="leidos" fill="#00a884" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="fallidos" fill="#ef4444" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}
