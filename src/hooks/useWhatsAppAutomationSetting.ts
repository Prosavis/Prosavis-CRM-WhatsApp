import { useCallback, useEffect, useState } from 'react';
import {
  getWhatsAppAutomationSetting,
  setWhatsAppAutomationSetting,
} from '@/services/whatsappService';

export function useWhatsAppAutomationSetting() {
  const [geminiEnabled, setGeminiEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  /** null = cerrado; true/false = valor objetivo al confirmar */
  const [confirmTarget, setConfirmTarget] = useState<boolean | null>(null);

  useEffect(() => {
    getWhatsAppAutomationSetting()
      .then(({ geminiInboundEnabled }) => setGeminiEnabled(geminiInboundEnabled))
      .catch(() => setGeminiEnabled(true))
      .finally(() => setLoading(false));
  }, []);

  const applyToggle = useCallback(async () => {
    const newValue = confirmTarget;
    if (newValue === null) return;
    setConfirmTarget(null);
    setLoading(true);
    try {
      await setWhatsAppAutomationSetting(newValue);
      setGeminiEnabled(newValue);
    } catch (err) {
      console.error('Error toggling automation:', err);
    } finally {
      setLoading(false);
    }
  }, [confirmTarget]);

  const cancelConfirm = useCallback(() => setConfirmTarget(null), []);

  return {
    geminiEnabled,
    loading,
    confirmTarget,
    setConfirmTarget,
    applyToggle,
    cancelConfirm,
  };
}
