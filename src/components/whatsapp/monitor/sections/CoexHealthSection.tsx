import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import BentoCard from '../ui/BentoCard';
import {
  checkWhatsAppCoexHealth,
  type WhatsAppCoexHealthResult,
} from '@/services/whatsappService';

const CoexHealthSection: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<WhatsAppCoexHealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setHealth(await checkWhatsAppCoexHealth());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar Coex 311');
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <BentoCard sx={{ height: '100%' }}>
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <StorefrontIcon color={health?.alertActive ? 'error' : 'action'} />
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
            Coex Comercial 311
          </Typography>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Heartbeat de la línea comercial. Si is_on_biz_app pasa a false, se registra alerta
          y no se envían mensajes ni se mueve la agenda. Francy debe abrir WhatsApp Business
          cada 13–14 días.
        </Typography>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {health && (
          <Alert severity={health.alertActive ? 'error' : 'success'}>
            {health.reason}. App={String(health.isOnBizApp)} · {health.platformType || 'sin platform'}
            {health.qualityRating ? ` · ${health.qualityRating}` : ''}
          </Alert>
        )}

        <Button
          size="small"
          variant="outlined"
          disabled={checking}
          startIcon={checking ? <CircularProgress size={14} /> : undefined}
          onClick={() => void refresh()}
        >
          {loading ? 'Consultando…' : 'Revisar ahora'}
        </Button>
      </Stack>
    </BentoCard>
  );
};

export default CoexHealthSection;
