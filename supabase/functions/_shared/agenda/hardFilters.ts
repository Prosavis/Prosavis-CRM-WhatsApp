import type {
  AgendaComplianceConfig,
  AgendaRequest,
  CleanerAgendaSnapshot,
  MinuteWindow,
} from "./types.ts";

export interface HardFilterResult {
  eligible: boolean;
  flags: string[];
}

function validMinuteWindow(window: MinuteWindow): boolean {
  return Number.isInteger(window.startMinute) &&
    Number.isInteger(window.endMinute) &&
    window.startMinute >= 0 &&
    window.endMinute <= 24 * 60 &&
    window.startMinute < window.endMinute;
}

export function windowsContainingDuration(
  windows: MinuteWindow[],
  clientWindow: MinuteWindow,
  durationMinutes: number,
): MinuteWindow[] {
  if (
    !validMinuteWindow(clientWindow) ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return [];
  }

  return windows
    .filter(validMinuteWindow)
    .map((window) => ({
      startMinute: Math.max(window.startMinute, clientWindow.startMinute),
      endMinute: Math.min(window.endMinute, clientWindow.endMinute),
    }))
    .filter((window) =>
      window.endMinute - window.startMinute >= durationMinutes
    )
    .sort((a, b) =>
      a.startMinute - b.startMinute || a.endMinute - b.endMinute
    );
}

export function applyHardFilters(
  cleaner: CleanerAgendaSnapshot,
  request: AgendaRequest,
  compliance: AgendaComplianceConfig,
): HardFilterResult {
  const flags: string[] = [];

  if (!cleaner.active) flags.push("cleaner_inactive");

  if (compliance.criticalEquivalentDays === undefined) {
    flags.push("critical_equivalent_days_missing");
  } else if (
    cleaner.equivalentDays === undefined ||
    !Number.isFinite(cleaner.equivalentDays)
  ) {
    flags.push("cleaner_equivalent_days_missing");
  } else if (cleaner.equivalentDays > compliance.criticalEquivalentDays) {
    flags.push("critical_equivalent_days_exceeded");
  }

  if (
    request.serviceType &&
    !cleaner.serviceSkills?.includes(request.serviceType)
  ) {
    flags.push("service_skill_missing");
  }

  if (request.requiresAlturas) {
    if (compliance.rcInsurancePolicyActive !== true) {
      flags.push(
        compliance.rcInsurancePolicyActive === undefined
          ? "rc_insurance_status_missing"
          : "rc_insurance_inactive",
      );
    }
    if (cleaner.alturasCertified !== true) {
      flags.push("alturas_certification_missing");
    }
    if (!cleaner.alturasExpiresOn) {
      flags.push("alturas_expiration_missing");
    } else if (cleaner.alturasExpiresOn < request.operationalDate) {
      flags.push("alturas_certification_expired");
    }
  }

  return { eligible: flags.length === 0, flags };
}
