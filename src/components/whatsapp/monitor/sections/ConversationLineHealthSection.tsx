import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import PhoneMissedIcon from '@mui/icons-material/PhoneMissed';
import HealingIcon from '@mui/icons-material/Healing';
import BentoCard from '../ui/BentoCard';
import {
  backfillWhatsAppConversationLine,
  type BackfillConversationLineResult,
} from '@/services/whatsappService';
import { WHATSAPP_CLOUD_PRODUCTION } from '@/constants/whatsappCloudAccounts';

/**
 * Chats creados por recordatorios/bulk sin phone_number_id quedan invisibles
 * en el inbox. Esta tarjeta permite inspeccionar y reparar.
 */
const ConversationLineHealthSection: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [orphanCount, setOrphanCount] = useState(0);
  const [lastResult, setLastResult] = useState<BackfillConversationLineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const phoneNumberId = WHATSAPP_CLOUD_PRODUCTION.phoneNumberId;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await backfillWhatsAppConversationLine({
        phoneNumberId,
        dryRun: true,
      });
      setOrphanCount(result.orphanCount);
      setLastResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error consultando chats huérfanos');
    } finally {
      setLoading(false);
    }
  }, [phoneNumberId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRepair = async () => {
    setRepairing(true);
    setError(null);
    try {
      const result = await backfillWhatsAppConversationLine({
        phoneNumberId,
        dryRun: false,
      });
      setLastResult(result);
      setOrphanCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error reparando chats');
    } finally {
      setRepairing(false);
    }
  };

  return (
    <BentoCard sx={{ height: '100%' }}>
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <PhoneMissedIcon color={orphanCount > 0 ? 'warning' : 'action'} />
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
            Chats sin línea WABA
          </Typography>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Conversaciones con <code>phone_number_id</code> vacío no aparecen en el Inbox.
          El sistema las repara al abrir el Inbox; aquí puedes forzar el backfill.
        </Typography>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {lastResult && lastResult.updatedCount > 0 && (
          <Alert severity="success">
            Reparados {lastResult.updatedCount} chat(s) → línea {lastResult.phoneNumberId}
          </Alert>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" fontWeight={600}>
            Huérfanos:{' '}
            {loading ? '…' : orphanCount.toLocaleString('es-CO')}
          </Typography>
          <Button size="small" onClick={() => void refresh()} disabled={loading || repairing}>
            Actualizar
          </Button>
          <Button
            size="small"
            variant="contained"
            color="warning"
            startIcon={repairing ? <CircularProgress size={14} color="inherit" /> : <HealingIcon />}
            disabled={loading || repairing || orphanCount === 0 || !phoneNumberId}
            onClick={() => void handleRepair()}
          >
            Reparar ahora
          </Button>
        </Box>
      </Stack>
    </BentoCard>
  );
};

export default ConversationLineHealthSection;
