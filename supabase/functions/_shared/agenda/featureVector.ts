import type {
  AgendaEngineInput,
  AgendaFeatureVectorStamp,
  AgendaOptionMode,
} from "./types.ts";

export function buildFeatureVectorStamp(
  input: AgendaEngineInput,
): AgendaFeatureVectorStamp {
  return {
    specVersion: input.request.specVersion,
    automationLevel: input.request.automationLevel,
    engineWeights: { ...input.weights },
    costConfigVersion: input.costConfig.version,
    travelConfigVersion: input.travelConfig.version,
  };
}

export function deterministicOptionId(
  mode: AgendaOptionMode,
  cleanerIds: string[],
  startMinute: number,
): string {
  const crew = [...cleanerIds].sort().join("-");
  return `${mode}-${crew}-${startMinute}`;
}
