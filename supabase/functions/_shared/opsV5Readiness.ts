export interface OpsV5ActivationDecision {
  id: string;
  label: string;
  ready: boolean;
}

export interface OpsV5Activation {
  suggestionMode: boolean;
  automationLevel: number;
  visitsAlertConfigured: boolean;
  payrollConfigActive: boolean | null;
  missingCommercialEnv: string[];
  blockingDecisions: OpsV5ActivationDecision[];
  readyForSuggestionPilot: boolean;
}

export interface BuildOpsV5ActivationInput {
  automationLevel: number;
  visitsAlertConfigured: boolean;
  payrollConfigActive: boolean | null;
  missingCommercialEnv: string[];
}

export function buildOpsV5Activation(
  input: BuildOpsV5ActivationInput,
): OpsV5Activation {
  const suggestionMode = input.automationLevel <= 1;
  const blockingDecisions: OpsV5ActivationDecision[] = [
    {
      id: "commercial-labor",
      label: "Configuración comercial y laboral",
      ready: input.missingCommercialEnv.length === 0,
    },
    {
      id: "payroll-oscar",
      label: "Aprobación laboral de nómina",
      ready: input.payrollConfigActive === true,
    },
    {
      id: "visits-waba",
      label: "Secretos WABA de visitas",
      ready: input.visitsAlertConfigured,
    },
    {
      id: "automation-2-3",
      label: "Automatización nivel 2/3",
      ready: input.automationLevel >= 2,
    },
  ];

  return {
    suggestionMode,
    automationLevel: input.automationLevel,
    visitsAlertConfigured: input.visitsAlertConfigured,
    payrollConfigActive: input.payrollConfigActive,
    missingCommercialEnv: [...input.missingCommercialEnv],
    blockingDecisions,
    readyForSuggestionPilot: suggestionMode,
  };
}
