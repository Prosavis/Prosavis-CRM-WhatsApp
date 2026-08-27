export interface CoexPhoneSnapshot {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  is_on_biz_app?: boolean | null;
  platform_type?: string | null;
  quality_rating?: string | null;
  status?: string | null;
}

export interface CoexHealthEvaluation {
  healthy: boolean;
  alertActive: boolean;
  reason: string;
}

export function evaluateCoexHealth(snapshot: CoexPhoneSnapshot): CoexHealthEvaluation {
  const onApp = snapshot.is_on_biz_app === true;
  const cloud = String(snapshot.platform_type ?? '').toUpperCase() === 'CLOUD_API';
  if (onApp && cloud) {
    return { healthy: true, alertActive: false, reason: 'Coex activa' };
  }
  if (!onApp) {
    return {
      healthy: false,
      alertActive: true,
      reason: 'is_on_biz_app=false. Francy debe abrir WhatsApp Business o reconectar Coex.',
    };
  }
  return {
    healthy: false,
    alertActive: true,
    reason: `platform_type=${snapshot.platform_type || 'unknown'}`,
  };
}
