import { sileo } from 'sileo';
import { inboxLineHex } from '@/utils/inboxLineVisual';
import type { WhatsAppLineId } from '@/utils/whatsappLines';

export const CRM_TOAST_POSITION = 'bottom-center' as const;

export type CrmToastMode = 'light' | 'dark';
export type CrmToastSeverity = 'success' | 'error' | 'warning' | 'info';

const TOASTER_FILL: Record<CrmToastMode, string> = {
  light: '#FFFFFF',
  dark: '#171717',
};

/** Fills por severidad: tintes claros de día, oscuros de noche (mismo criterio que UserConsole). */
const SEVERITY_FILL: Record<CrmToastMode, Record<CrmToastSeverity, string>> = {
  light: {
    success: '#D1FAE5',
    error: '#FEE2E2',
    warning: '#FEF3C7',
    info: '#DBEAFE',
  },
  dark: {
    success: '#064E3B',
    error: '#7F1D1D',
    warning: '#78350F',
    info: '#1E3A5F',
  },
};

/** Tintes de línea para inbound: no usar el hex sólido (rompe el texto en light). */
const INBOUND_FILL: Record<WhatsAppLineId, Record<CrmToastMode, string>> = {
  bot: { light: '#E8EEF4', dark: '#0A2238' },
  commercial: { light: '#FFF1E6', dark: '#4A2200' },
};

let activeMode: CrmToastMode = 'light';

export function setCrmToastMode(mode: CrmToastMode): void {
  activeMode = mode;
}

export function getCrmToastMode(): CrmToastMode {
  return activeMode;
}

export function crmToasterFill(mode: CrmToastMode): string {
  return TOASTER_FILL[mode];
}

export function crmToastFill(
  severity: CrmToastSeverity,
  mode: CrmToastMode = activeMode,
): string {
  return SEVERITY_FILL[mode][severity];
}

export function inboundToastFill(
  line: WhatsAppLineId,
  mode: CrmToastMode = activeMode,
): string {
  return INBOUND_FILL[line][mode];
}

export function inboundToastAccent(line: WhatsAppLineId): string {
  return inboxLineHex(line);
}

export type CrmToastExtra = {
  description?: string;
  duration?: number;
  fill?: string;
};

function toastOpts(title: string, severity: CrmToastSeverity, extra?: CrmToastExtra) {
  return {
    title,
    position: CRM_TOAST_POSITION,
    fill: extra?.fill ?? crmToastFill(severity),
    description: extra?.description,
    duration: extra?.duration,
  };
}

export const crmToast = {
  success(title: string, extra?: CrmToastExtra) {
    sileo.success(toastOpts(title, 'success', extra));
  },
  error(title: string, extra?: CrmToastExtra) {
    sileo.error(toastOpts(title, 'error', extra));
  },
  warning(title: string, extra?: CrmToastExtra) {
    sileo.warning(toastOpts(title, 'warning', extra));
  },
  info(title: string, extra?: CrmToastExtra) {
    sileo.info(toastOpts(title, 'info', extra));
  },
  show(severity: CrmToastSeverity, title: string, extra?: CrmToastExtra) {
    this[severity](title, extra);
  },
  inbound(args: {
    line: WhatsAppLineId;
    title: string;
    description?: string;
    onView: () => void;
    duration?: number;
  }) {
    sileo.action({
      title: args.title,
      description: args.description,
      position: CRM_TOAST_POSITION,
      fill: inboundToastFill(args.line),
      duration: args.duration ?? 6000,
      button: {
        title: 'Ver chat',
        onClick: args.onView,
      },
    });
  },
};
