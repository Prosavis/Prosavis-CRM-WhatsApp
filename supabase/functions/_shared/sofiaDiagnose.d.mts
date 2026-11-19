export function normalizeDiagnosis(raw: unknown): {
  flujos: string[];
  etapa: string;
  errores: string[];
  funciono: string;
  mejora: string;
  bien: string;
  mal: string;
  siguiente_accion: string;
  sofia_puede_tomar_control: boolean;
  motivo_control: string;
  etiquetas: string[];
};
