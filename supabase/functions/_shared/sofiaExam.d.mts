export function examHardFailures(suggestion: string): string[];
export function normalizeJudge(raw: unknown): { alineado: boolean; riesgo: string; motivo: string };
export function examCasePassed(
  hardFailures: string[],
  judge: { alineado: boolean; riesgo: string; motivo: string },
): boolean;
