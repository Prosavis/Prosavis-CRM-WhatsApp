/**
 * Preferencias de agendamiento Prosavis Limpieza.
 * Misma regla que functions/src/directory/schedulingPreferences.ts
 */

export type SchedulingPreference = {
  cleanerId: string;
  name: string;
  assignPriority: number;
  excludeFromRescue: boolean;
  note: string;
};

export const DEFAULT_ASSIGN_PRIORITY = 100;
export const FRANCY_OLIVERA_ID = "vF4kcE8kMFQiFIPLLo9OnYJ5E5l1";
export const JENNIFER_MOLINA_ID = "LgumzEtuf2aKlmiEofBM3KauMN32";

const PREFERENCES: Record<string, SchedulingPreference> = {
  [FRANCY_OLIVERA_ID]: {
    cleanerId: FRANCY_OLIVERA_ID,
    name: "Francy Olivera",
    assignPriority: 0,
    excludeFromRescue: true,
    note:
      "Jefa y administradora del servicio. No agendarle servicios salvo excepción humana.",
  },
  [JENNIFER_MOLINA_ID]: {
    cleanerId: JENNIFER_MOLINA_ID,
    name: "Jennifer Molina",
    assignPriority: 20,
    excludeFromRescue: false,
    note:
      "Auxiliar de limpieza personal de Francy. Calidad alta; última opción de rescate.",
  },
};

export function getSchedulingPreference(
  cleanerId: string,
): SchedulingPreference {
  return PREFERENCES[cleanerId] ?? {
    cleanerId,
    name: "",
    assignPriority: DEFAULT_ASSIGN_PRIORITY,
    excludeFromRescue: false,
    note: "",
  };
}

export function isExcludedFromRescue(cleanerId: string): boolean {
  return getSchedulingPreference(cleanerId).excludeFromRescue;
}

export function assignPriorityOf(cleanerId: string): number {
  return getSchedulingPreference(cleanerId).assignPriority;
}

export function compareAssignPriority(
  leftId: string,
  rightId: string,
): number {
  const priority = assignPriorityOf(rightId) - assignPriorityOf(leftId);
  if (priority !== 0) return priority;
  return leftId.localeCompare(rightId);
}

export function minAssignPriority(cleanerIds: readonly string[]): number {
  if (cleanerIds.length === 0) return DEFAULT_ASSIGN_PRIORITY;
  return Math.min(...cleanerIds.map(assignPriorityOf));
}
