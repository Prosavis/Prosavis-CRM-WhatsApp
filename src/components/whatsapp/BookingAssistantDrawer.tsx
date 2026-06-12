import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
  Button,
  Alert,
  TextField,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PaymentIcon from '@mui/icons-material/Payment';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkIcon from '@mui/icons-material/Link';
import { getStaticCleaningWompiUrl } from '@/constants/cleaningWompiLinks';
import {
  listWhatsAppMessageTemplates,
  sendWhatsAppTemplateMessageAdmin,
  type BookingContextData,
  type WhatsAppTemplateSummary,
} from '@/services/whatsappService';
import MetaTemplateEditor from '@/components/whatsapp/templates/MetaTemplateEditor';
import TemplateLibrary from '@/components/whatsapp/templates/TemplateLibrary';
import {
  buildDisplayMessageBody,
  buildTemplateSendComponents,
  countSlotsForTemplate,
} from '@/utils/whatsappTemplateHelpers';
import {
  isWithinMetaSessionWindow,
  selectWhatsAppTemplateSuggestion,
  type WhatsAppTemplateSuggestion,
} from '@/utils/whatsappTemplateSuggestions';

interface BookingAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  bookingContext: BookingContextData;
  suggestion: string | null;
  onUseSuggestion: (text: string) => void;
  /** Desde la última sugerencia IA con checkout dinámico */
  wompiCheckoutUrl?: string | null;
  wompiPaymentReference?: string | null;
  wompiAmountCOP?: number | null;
  /** Se incrementa al recibir nueva sugerencia con contexto booking para sincronizar el formulario */
  checkoutSyncEpoch: number;
  onInsertPaymentLink: (url: string) => void;
  wabaId?: string;
  phoneNumberId?: string;
  recipientPhone?: string;
  conversationDisplayName?: string;
  lastInboundAt?: Date | null;
  lastMessageDirection?: 'inbound' | 'outbound';
}

const STAGE_LABELS: Record<string, string> = {
  no_booking: 'Sin intención de reserva',
  info_gathering: 'Recopilando datos',
  availability: 'Verificando disponibilidad',
  summary_confirmation: 'Confirmación del cliente',
  payment_pending: 'Esperando pago',
  payment_confirmed: 'Pago confirmado',
};

const STAGE_STEPS = [
  'Datos',
  'Disponibilidad',
  'Confirmación',
  'Pago',
  'Listo',
];

function getActiveStep(stage: string): number {
  switch (stage) {
    case 'info_gathering': return 0;
    case 'availability': return 1;
    case 'summary_confirmation': return 2;
    case 'payment_pending': return 3;
    case 'payment_confirmed': return 4;
    default: return -1;
  }
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount);
}

const BookingAssistantDrawer: React.FC<BookingAssistantDrawerProps> = ({
  open,
  onClose,
  bookingContext,
  suggestion,
  onUseSuggestion,
  wompiCheckoutUrl = null,
  wompiPaymentReference = null,
  wompiAmountCOP = null,
  checkoutSyncEpoch,
  onInsertPaymentLink,
  wabaId,
  phoneNumberId,
  recipientPhone,
  conversationDisplayName,
  lastInboundAt = null,
  lastMessageDirection,
}) => {
  const activeStep = getActiveStep(bookingContext.stage);
  const { collectedData, missingData, availableSlots, paymentStatus, calculatedPrice, clientInfo } = bookingContext;

  const [amountInput, setAmountInput] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [paymentRef, setPaymentRef] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [metaTemplates, setMetaTemplates] = useState<WhatsAppTemplateSummary[]>([]);
  const [metaTemplatesLoading, setMetaTemplatesLoading] = useState(false);
  const [metaTemplatesError, setMetaTemplatesError] = useState<string | null>(null);
  const [templateHeaderValues, setTemplateHeaderValues] = useState<string[]>([]);
  const [templateBodyValues, setTemplateBodyValues] = useState<string[]>([]);
  const [templateSendLoading, setTemplateSendLoading] = useState(false);
  const [templateSendError, setTemplateSendError] = useState<string | null>(null);
  const [templateSentOk, setTemplateSentOk] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const base = wompiAmountCOP ?? calculatedPrice;
    setAmountInput(base != null && base > 0 ? String(Math.round(base)) : '');
    setCheckoutUrl(wompiCheckoutUrl);
    setPaymentRef(wompiPaymentReference);
    setCheckoutError(null);
  }, [open, checkoutSyncEpoch, wompiCheckoutUrl, wompiPaymentReference, wompiAmountCOP, calculatedPrice]);

  useEffect(() => {
    if (!open || !wabaId || isWithinMetaSessionWindow(lastInboundAt)) return;

    setMetaTemplatesLoading(true);
    setMetaTemplatesError(null);
    listWhatsAppMessageTemplates(wabaId)
      .then((templates) => setMetaTemplates(templates))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar plantillas Meta';
        setMetaTemplatesError(message);
        setMetaTemplates([]);
      })
      .finally(() => setMetaTemplatesLoading(false));
  }, [lastInboundAt, open, wabaId]);

  const templateSuggestion: WhatsAppTemplateSuggestion | null = useMemo(
    () =>
      selectWhatsAppTemplateSuggestion(metaTemplates, {
        bookingContext,
        conversationDisplayName,
        lastInboundAt,
        lastMessageDirection,
      }),
    [
      bookingContext,
      conversationDisplayName,
      lastInboundAt,
      lastMessageDirection,
      metaTemplates,
    ],
  );

  useEffect(() => {
    if (!templateSuggestion) {
      setTemplateHeaderValues([]);
      setTemplateBodyValues([]);
      setTemplateSendError(null);
      setTemplateSentOk(false);
      return;
    }

    setTemplateHeaderValues(templateSuggestion.headerValues);
    setTemplateBodyValues(templateSuggestion.bodyValues);
    setTemplateSendError(null);
    setTemplateSentOk(false);
  }, [templateSuggestion]);

  useEffect(() => {
    if (!open) return;
    if (paymentStatus === 'APPROVED') return;

    const digits = amountInput.replace(/\D/g, '');
    const n = digits ? parseInt(digits, 10) : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      setCheckoutUrl(null);
      setPaymentRef(null);
      setCheckoutLoading(false);
      return;
    }

    // No llamamos al backend si el monto está por debajo del mínimo razonable
    // (probable error de tipeo del operador, ej. "98" en vez de "98000").
    if (n < 10000) {
      setCheckoutUrl(null);
      setPaymentRef(null);
      setCheckoutLoading(false);
      setCheckoutError(null);
      return;
    }

    const staticUrl = getStaticCleaningWompiUrl(n);
    setCheckoutLoading(false);
    if (staticUrl) {
      setCheckoutUrl(staticUrl);
      setPaymentRef(`STATIC-${staticUrl.split('/').pop() ?? 'LINK'}`);
      setCheckoutError(null);
      return;
    }

    setCheckoutUrl(null);
    setPaymentRef(null);
    setCheckoutError(
      'Monto no estándar: crea en Wompi un link manual por el valor exacto y compártelo con el cliente.'
    );
  }, [
    amountInput,
    open,
    paymentStatus,
  ]);

  const handleAmountChange = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    setAmountInput(digits);
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(checkoutUrl);
    } catch {
      setCheckoutError('No se pudo copiar al portapapeles');
    }
  }, [checkoutUrl]);

  const handleSendSuggestedTemplate = useCallback(async () => {
    if (!templateSuggestion || !recipientPhone || !phoneNumberId) return;

    const { header, body } = countSlotsForTemplate(templateSuggestion.template);
    if (header > 0 && templateHeaderValues.some((value) => !value.trim())) {
      setTemplateSendError('Completa todos los parámetros del encabezado');
      return;
    }
    if (body > 0 && templateBodyValues.some((value) => !value.trim())) {
      setTemplateSendError('Completa todos los parámetros del cuerpo');
      return;
    }

    const components = buildTemplateSendComponents(
      templateSuggestion.template,
      templateHeaderValues,
      templateBodyValues,
    );
    const displayMessageBody = buildDisplayMessageBody(
      templateSuggestion.template,
      templateHeaderValues,
      templateBodyValues,
    );

    setTemplateSendLoading(true);
    setTemplateSendError(null);
    setTemplateSentOk(false);
    try {
      await sendWhatsAppTemplateMessageAdmin({
        recipientPhone,
        phoneNumberId,
        templateName: templateSuggestion.template.name,
        templateLanguage: templateSuggestion.template.language,
        components: components.length > 0 ? components : undefined,
        displayMessageBody,
      });
      setTemplateSentOk(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar la plantilla';
      setTemplateSendError(message);
    } finally {
      setTemplateSendLoading(false);
    }
  }, [
    phoneNumberId,
    recipientPhone,
    templateBodyValues,
    templateHeaderValues,
    templateSuggestion,
  ]);

  const showPaymentLinkSection = paymentStatus !== 'APPROVED';
  const parsedAmount = amountInput ? parseInt(amountInput, 10) : NaN;
  const amountDiffersFromSuggestion =
    wompiAmountCOP != null &&
    amountInput &&
    parsedAmount !== wompiAmountCOP;
  const MIN_REASONABLE_AMOUNT_COP = 10000;
  const amountTooLow =
    Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount < MIN_REASONABLE_AMOUNT_COP;
  const suggestionContext = useMemo(
    () => ({
      bookingContext,
      conversationDisplayName,
      lastInboundAt,
      lastMessageDirection,
    }),
    [bookingContext, conversationDisplayName, lastInboundAt, lastMessageDirection],
  );

  return (
    <>
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 380 }, p: 0 },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            bgcolor: '#7c3aed',
            color: 'white',
          }}
        >
          <Typography variant="subtitle1" fontWeight={700}>
            Asistente de Agendamiento
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
          <Alert
            severity={
              bookingContext.stage === 'payment_confirmed'
                ? 'success'
                : bookingContext.stage === 'payment_pending'
                  ? 'warning'
                  : 'info'
            }
            sx={{ mb: 2 }}
            icon={false}
          >
            <Typography variant="body2" fontWeight={600}>
              {STAGE_LABELS[bookingContext.stage] || bookingContext.stage}
            </Typography>
          </Alert>

          {activeStep >= 0 && (
            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 2 }}>
              {STAGE_STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel
                    sx={{ '& .MuiStepLabel-label': { fontSize: '0.7rem' } }}
                  >
                    {label}
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
          )}

          <Divider sx={{ mb: 2 }} />

          <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
            <PersonIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight={600}>
              Cliente
            </Typography>
            {clientInfo.isReturningClient && (
              <Chip label="Recurrente" size="small" color="success" sx={{ height: 20 }} />
            )}
          </Stack>
          <Box sx={{ pl: 3.5, mb: 2 }}>
            {clientInfo.name && (
              <Typography variant="body2">{clientInfo.name}</Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {clientInfo.phone}
            </Typography>
            {clientInfo.address && (
              <Typography variant="body2" color="text.secondary">
                {clientInfo.address}
              </Typography>
            )}
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
            <CalendarMonthIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight={600}>
              Datos de reserva
            </Typography>
          </Stack>
          <Box sx={{ pl: 3.5, mb: 2 }}>
            <Stack spacing={0.5}>
              <DataRow
                label="Fecha"
                value={collectedData.date}
                missing={missingData.includes('fecha')}
              />
              <DataRow
                label="Hora"
                value={collectedData.time}
                missing={missingData.includes('hora')}
              />
              <DataRow
                label="Duración"
                value={collectedData.duration ? `${collectedData.duration / 60}h` : null}
                missing={missingData.includes('duración')}
              />
              <DataRow
                label="Dirección"
                value={collectedData.address}
                missing={missingData.includes('dirección')}
              />
              {collectedData.addressSource === 'lead' && collectedData.address && (
                <Typography variant="caption" color="text.secondary">
                  Dirección guardada del lead; conviene confirmarla con el cliente.
                </Typography>
              )}
            </Stack>
          </Box>

          {calculatedPrice && (
            <>
              <Divider sx={{ mb: 2 }} />
              <Box
                sx={{
                  bgcolor: 'success.50',
                  border: '1px solid',
                  borderColor: 'success.200',
                  borderRadius: 1,
                  px: 2,
                  py: 1,
                  mb: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="body2" fontWeight={600}>
                  Precio (tabla)
                </Typography>
                <Typography variant="h6" fontWeight={700} color="success.main">
                  {formatCOP(calculatedPrice)}
                </Typography>
              </Box>
            </>
          )}

          {availableSlots.length > 0 && (
            <>
              <Divider sx={{ mb: 2 }} />
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <AccessTimeIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" fontWeight={600}>
                  Slots disponibles
                </Typography>
              </Stack>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pl: 3.5, mb: 2 }}>
                {availableSlots.map((slot) => (
                  <Chip
                    key={slot}
                    label={slot}
                    size="small"
                    variant={slot === collectedData.time ? 'filled' : 'outlined'}
                    color={slot === collectedData.time ? 'primary' : 'default'}
                    sx={{ fontFamily: 'monospace' }}
                  />
                ))}
              </Box>
            </>
          )}

          {collectedData.date && availableSlots.length === 0 && (
            <>
              <Divider sx={{ mb: 2 }} />
              <Alert severity="warning" sx={{ mb: 2 }}>
                No hay disponibilidad para la fecha seleccionada.
              </Alert>
            </>
          )}

          <Divider sx={{ mb: 2 }} />
          <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
            <PaymentIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight={600}>
              Estado de pago
            </Typography>
          </Stack>
          <Box sx={{ pl: 3.5, mb: 2 }}>
            <PaymentBadge status={paymentStatus} amount={bookingContext.paymentAmount} />
          </Box>

          {showPaymentLinkSection && (
            <>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                Link de pago Wompi (tarifa estándar)
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                Los links automáticos solo aplican a las tarifas estándar activas: 4h, 6h y 8h. Si acordaron descuento, kit o precio especial, crea un link manual en Wompi por el total exacto.
              </Typography>
              <TextField
                size="small"
                fullWidth
                label="Monto (COP)"
                value={amountInput}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="Ej. 98000"
                error={amountTooLow}
                helperText={
                  Number.isFinite(parsedAmount) && parsedAmount > 0
                    ? amountTooLow
                      ? `⚠️ Monto demasiado bajo. ¿Quisiste decir ${formatCOP(parsedAmount * 1000)}? Recuerda escribir los miles (ej. "98000" = ${formatCOP(98000)}).`
                      : `Equivale a ${formatCOP(parsedAmount)} COP`
                    : ' '
                }
                sx={{ mb: 1 }}
              />
              {amountDiffersFromSuggestion && !amountTooLow && (
                <Alert severity="info" sx={{ mb: 1.5, py: 0.5 }}>
                  <Typography variant="caption">
                    El monto difiere del generado con la última sugerencia IA. Conviene volver a generar sugerencia para alinear el texto del mensaje con este monto.
                  </Typography>
                </Alert>
              )}
              {checkoutLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <CircularProgress size={18} />
                  <Typography variant="caption" color="text.secondary">
                    Resolviendo link de tarifa estándar…
                  </Typography>
                </Box>
              )}
              {checkoutError && (
                <Alert severity="error" sx={{ mb: 1 }}>
                  {checkoutError}
                </Alert>
              )}
              {paymentRef && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, fontFamily: 'monospace' }}>
                  Ref: {paymentRef}
                </Typography>
              )}
              <Stack direction="column" spacing={1} sx={{ mb: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ContentCopyIcon />}
                  disabled={!checkoutUrl || checkoutLoading}
                  onClick={handleCopyLink}
                  sx={{ textTransform: 'none' }}
                >
                  Copiar link de pago
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<LinkIcon />}
                  disabled={!checkoutUrl || checkoutLoading}
                  onClick={() => checkoutUrl && onInsertPaymentLink(checkoutUrl)}
                  sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
                >
                  Insertar link en el borrador
                </Button>
              </Stack>
            </>
          )}

          {(metaTemplatesLoading || metaTemplatesError || templateSuggestion) && (
            <>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                Plantilla sugerida para reactivar
              </Typography>

              {metaTemplatesLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <CircularProgress size={18} />
                  <Typography variant="caption" color="text.secondary">
                    Buscando plantilla Meta aprobada…
                  </Typography>
                </Box>
              )}

              {metaTemplatesError && (
                <Alert severity="error" sx={{ mb: 1.5 }}>
                  {metaTemplatesError}
                </Alert>
              )}

              {templateSuggestion && (
                <Box sx={{ mb: 2 }}>
                  <MetaTemplateEditor
                    mode="booking"
                    template={templateSuggestion.template}
                    values={{ header: templateHeaderValues, body: templateBodyValues }}
                    onValuesChange={(values) => {
                      setTemplateHeaderValues(values.header);
                      setTemplateBodyValues(values.body);
                    }}
                    showBackButton={false}
                    suggestionReason={templateSuggestion.reason}
                    sending={templateSendLoading}
                    sendError={templateSendError}
                    onSend={
                      recipientPhone && phoneNumberId
                        ? () => void handleSendSuggestedTemplate()
                        : undefined
                    }
                    onApplyDraft={onUseSuggestion}
                  />
                  {templateSentOk && (
                    <Alert severity="success" sx={{ mt: 1 }}>
                      Plantilla enviada correctamente.
                    </Alert>
                  )}
                  {wabaId && (
                    <Button
                      fullWidth
                      variant="outlined"
                      sx={{ mt: 1, textTransform: 'none' }}
                      onClick={() => setTemplateLibraryOpen(true)}
                    >
                      Ver biblioteca completa
                    </Button>
                  )}
                </Box>
              )}
            </>
          )}

          {suggestion && (
            <>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                Sugerencia IA
              </Typography>
              <Box
                sx={{
                  bgcolor: '#f3f0ff',
                  borderRadius: 1,
                  p: 1.5,
                  mb: 1.5,
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {suggestion}
              </Box>
              <Button
                fullWidth
                variant="contained"
                startIcon={<ContentCopyIcon />}
                onClick={() => onUseSuggestion(suggestion)}
                sx={{
                  bgcolor: '#7c3aed',
                  '&:hover': { bgcolor: '#6d28d9' },
                  textTransform: 'none',
                }}
              >
                Usar esta sugerencia
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Drawer>

    {wabaId && (
      <Drawer
        anchor="right"
        open={templateLibraryOpen}
        onClose={() => setTemplateLibraryOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, p: 0 } }}
      >
        <TemplateLibrary
          mode="booking"
          compact
          wabaId={wabaId}
          phoneNumberId={phoneNumberId}
          recipientPhone={recipientPhone}
          onApplyDraft={(text) => {
            onUseSuggestion(text);
            setTemplateLibraryOpen(false);
          }}
          suggestionContext={suggestionContext}
          bookingContext={bookingContext}
          initialTemplate={templateSuggestion?.template ?? null}
          initialValues={
            templateSuggestion
              ? { header: templateHeaderValues, body: templateBodyValues }
              : undefined
          }
          suggestionReason={templateSuggestion?.reason ?? null}
        />
      </Drawer>
    )}
    </>
  );
};

const DataRow: React.FC<{ label: string; value: string | null; missing: boolean }> = ({
  label,
  value,
  missing,
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    {value ? (
      <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
    ) : (
      <ErrorIcon sx={{ fontSize: 16, color: missing ? 'error.main' : 'text.disabled' }} />
    )}
    <Typography variant="body2" color={value ? 'text.primary' : 'text.secondary'}>
      <strong>{label}:</strong> {value || 'No proporcionado'}
    </Typography>
  </Box>
);

const PaymentBadge: React.FC<{ status: string; amount: number | null }> = ({ status, amount }) => {
  const config = {
    APPROVED: { color: 'success' as const, label: 'Pago verificado', icon: '✅' },
    PENDING: { color: 'warning' as const, label: 'Pago pendiente', icon: '⏳' },
    none: { color: 'default' as const, label: 'Sin pago registrado', icon: '—' },
  };
  const cfg = config[status as keyof typeof config] || config.none;

  return (
    <Stack spacing={0.5}>
      <Chip
        label={`${cfg.icon} ${cfg.label}`}
        color={cfg.color}
        size="small"
        sx={{ width: 'fit-content' }}
      />
      {amount && (
        <Typography variant="caption" color="text.secondary">
          Monto: {formatCOP(amount)}
        </Typography>
      )}
    </Stack>
  );
};

export default BookingAssistantDrawer;
