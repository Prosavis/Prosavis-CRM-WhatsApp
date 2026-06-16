import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Step,
  StepLabel,
  Stepper,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import {
  runBulkWhatsAppSend,
  retryBulkWhatsAppSend,
  type BulkSendCounts,
} from '@/services/whatsappService';
import type { DirectoryEntry } from '@/types/lead';
import { countSlotsForTemplate } from '@/utils/whatsappTemplateHelpers';
import BulkSendAudienceStep from './BulkSendAudienceStep';
import BulkSendConfirmStep from './BulkSendConfirmStep';
import BulkSendMessageStep from './BulkSendMessageStep';
import BulkSendResultStep from './BulkSendResultStep';
import {
  BULK_CONFIRM_PHRASE,
  BULK_SEND_MAX_RECIPIENTS,
  buildBulkRecipients,
  buildTemplatePayload,
  parseManualPhones,
  type BulkMessageState,
} from './bulkSendTypes';

export interface WhatsAppBulkSendDialogProps {
  open: boolean;
  onClose: () => void;
  wabaId: string;
  phoneNumberId: string;
  botLabel: string;
  phoneDisplay: string;
}

const INITIAL_MESSAGE: BulkMessageState = {
  mode: 'template',
  text: '',
  selectedTemplate: null,
  headerValues: [],
  bodyValues: [],
};

const WhatsAppBulkSendDialog: React.FC<WhatsAppBulkSendDialogProps> = ({
  open,
  onClose,
  wabaId,
  phoneNumberId,
  botLabel,
  phoneDisplay,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));

  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEntries, setSelectedEntries] = useState<DirectoryEntry[]>([]);
  const [manualPhonesRaw, setManualPhonesRaw] = useState('');
  const [message, setMessage] = useState<BulkMessageState>(INITIAL_MESSAGE);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BulkSendCounts | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<BulkSendCounts | null>(null);

  const manualPhones = useMemo(() => parseManualPhones(manualPhonesRaw), [manualPhonesRaw]);
  const recipients = useMemo(
    () => buildBulkRecipients(selectedEntries, manualPhones),
    [selectedEntries, manualPhones],
  );
  const recipientCount = recipients.length;

  const resetState = useCallback(() => {
    setStep(0);
    setSelectedIds(new Set());
    setSelectedEntries([]);
    setManualPhonesRaw('');
    setMessage(INITIAL_MESSAGE);
    setConfirmPhrase('');
    setError(null);
    setProgress(null);
    setJobId(null);
    setResult(null);
    setLoading(false);
    setRetrying(false);
  }, []);

  const handleClose = () => {
    if (loading || retrying) return;
    resetState();
    onClose();
  };

  const handleSelectedChange = (ids: Set<string>, entries: DirectoryEntry[]) => {
    setSelectedIds(ids);
    setSelectedEntries(entries);
  };

  const isMessageValid = useMemo(() => {
    if (message.mode === 'text') return message.text.trim().length > 0;
    if (!message.selectedTemplate) return false;
    const { header, body } = countSlotsForTemplate(message.selectedTemplate);
    if (header > 0 && message.headerValues.slice(0, header).some((v) => !v.trim())) return false;
    if (body > 0 && message.bodyValues.slice(0, body).some((v) => !v.trim())) return false;
    return true;
  }, [message]);

  const canGoNext =
    (step === 0 && recipientCount > 0 && recipientCount <= BULK_SEND_MAX_RECIPIENTS) ||
    (step === 1 && isMessageValid);

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    setProgress(null);
    try {
      const templatePayload = buildTemplatePayload(message);
      const sendResult = await runBulkWhatsAppSend(
        {
          recipients,
          ...templatePayload,
          ...(message.mode === 'text' ? { richBody: message.text.trim() } : {}),
          phoneNumberId,
          confirmation: BULK_CONFIRM_PHRASE,
        },
        (chunk) => {
          setJobId(chunk.jobId);
          setProgress(chunk.totals);
        },
      );
      setJobId(sendResult.jobId);
      setResult(sendResult.totals);
      setStep(3);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Error al enviar');
    } finally {
      setLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!jobId) return;
    setRetrying(true);
    setError(null);
    try {
      const retryResult = await retryBulkWhatsAppSend(jobId, (chunk) => {
        setProgress(chunk.totals);
      });
      setResult(retryResult.totals);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Error al reintentar');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={fullScreen}
      maxWidth="xl"
      fullWidth
      scroll="paper"
      sx={{ '& .MuiDialog-paper': { height: fullScreen ? '100%' : '90vh', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <SendIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
            Envío masivo WhatsApp
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {botLabel} · {phoneDisplay}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small" disabled={loading} aria-label="Cerrar envío masivo">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Divider />

      <Box sx={{ px: 2, py: 2, flexShrink: 0 }}>
        <Stepper activeStep={step} alternativeLabel>
          <Step><StepLabel>Audiencia</StepLabel></Step>
          <Step><StepLabel>Mensaje</StepLabel></Step>
          <Step><StepLabel>Confirmar</StepLabel></Step>
          <Step><StepLabel>Resultado</StepLabel></Step>
        </Stepper>
      </Box>

      <DialogContent
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: step === 0 || step === 1 ? 'hidden' : 'auto',
          px: 2,
        }}
      >
        {step === 0 && (
          <BulkSendAudienceStep
            selectedIds={selectedIds}
            selectedEntries={selectedEntries}
            manualPhonesRaw={manualPhonesRaw}
            recipientCount={recipientCount}
            onSelectedIdsChange={handleSelectedChange}
            onManualPhonesRawChange={setManualPhonesRaw}
          />
        )}
        {step === 1 && (
          <BulkSendMessageStep wabaId={wabaId} message={message} onMessageChange={setMessage} />
        )}
        {step === 2 && (
          <BulkSendConfirmStep
            recipientCount={recipientCount}
            message={message}
            botLabel={botLabel}
            phoneDisplay={phoneDisplay}
            confirmPhrase={confirmPhrase}
            onConfirmPhraseChange={setConfirmPhrase}
            error={error}
          />
        )}
        {step === 2 && loading && progress && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Enviando por lotes… {progress.sent + progress.failed + progress.skipped} de {progress.total}
              {' · '}Enviados: {progress.sent} · Fallidos: {progress.failed} · Omitidos: {progress.skipped}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress.total > 0
                ? Math.round(((progress.total - progress.pending) / progress.total) * 100)
                : 0}
            />
          </Box>
        )}
        {step === 3 && result && (
          <BulkSendResultStep
            sent={result.sent}
            failed={result.failed}
            skipped={result.skipped}
            onRetryFailed={result.failed > 0 ? handleRetryFailed : undefined}
            retrying={retrying}
            error={error}
          />
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 2, py: 1.5, flexShrink: 0 }}>
        <Button onClick={handleClose} disabled={loading || retrying}>
          {step === 3 ? 'Cerrar' : 'Cancelar'}
        </Button>
        {step > 0 && step < 3 && (
          <Button onClick={() => setStep((s) => s - 1)} disabled={loading}>
            Atrás
          </Button>
        )}
        {step < 2 && (
          <Button variant="contained" onClick={() => setStep((s) => s + 1)} disabled={!canGoNext}>
            Siguiente
          </Button>
        )}
        {step === 2 && (
          <Button
            variant="contained"
            color="warning"
            onClick={() => void handleSend()}
            disabled={loading || confirmPhrase !== BULK_CONFIRM_PHRASE}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Enviar a todos'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default WhatsAppBulkSendDialog;
