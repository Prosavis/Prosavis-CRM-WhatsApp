export interface MinuteWindow {
  startMinute: number;
  endMinute: number;
}

export interface TravelLocation {
  comuna?: string;
  lat?: number;
  lng?: number;
}

export interface TravelMatrixEntry {
  originComuna: string;
  destinationComuna: string;
  hourBucket: number;
  minutesEstimate: number;
  sampleCount: number;
}

export interface TravelConfig {
  learnedSampleThreshold?: number;
  fallbackUrbanKmh?: number;
  minimumFallbackMinutes?: number;
  ewmaAlpha?: number;
  version: string;
}

export interface MarginalCostConfig {
  hourlyNetCOP?: number;
  dailyFloorCOP?: number;
  employerCostMultiplier?: number;
  transportPerVisitCOP?: number;
  version: string;
}

export interface AgendaEngineWeights {
  marginalCost: number;
  travelMinutes: number;
  rating: number;
  clientAffinity: number;
  incomeEquity: number;
  gapFit: number;
}

export interface AgendaComplianceConfig {
  criticalEquivalentDays?: number;
  rcInsurancePolicyActive?: boolean;
}

export interface AgendaRequest {
  requestId: string;
  specVersion: string;
  automationLevel: number;
  operationalDate: string;
  requiredMinutes: number;
  compositeMemberMinutes?: number;
  clientWindow: MinuteWindow;
  serviceType?: string;
  requiresAlturas: boolean;
  grossRevenueCOP?: number;
  otherMarginalCostCOP?: number;
  destination: TravelLocation;
  departureHour: number;
}

export interface CleanerAgendaSnapshot {
  cleanerId: string;
  active: boolean;
  acceptsComposite: boolean;
  serviceSkills?: string[];
  alturasCertified?: boolean;
  alturasExpiresOn?: string;
  equivalentDays?: number;
  alreadyWorkedThatDay: boolean;
  availableWindows: MinuteWindow[];
  location: TravelLocation;
  nextLocation?: TravelLocation;
  rating?: number;
  clientAffinity?: number;
  income30dCOP?: number;
  roundingSlackMinutes?: number;
}

export interface AgendaEngineInput {
  request: AgendaRequest;
  cleaners: CleanerAgendaSnapshot[];
  compliance: AgendaComplianceConfig;
  costConfig: MarginalCostConfig;
  travelConfig: TravelConfig;
  weights: AgendaEngineWeights;
  travelMatrix: TravelMatrixEntry[];
}

export type AgendaOptionMode = "single" | "composite";

export interface AgendaCrewOption {
  cleanerId: string;
  minutes: number;
  alreadyWorkedThatDay: boolean;
  marginalCostCOP: number | null;
  travelMinutes: number | null;
}

export interface AgendaFeatureVector {
  marginalCostCOP: number | null;
  travelMinutes: number | null;
  rating: number | null;
  clientAffinity: number | null;
  income30dCOP: number | null;
  gapResidualMinutes: number;
  roundingSlackMinutes: number | null;
}

export interface AgendaOption {
  optionId: string;
  mode: AgendaOptionMode;
  crew: AgendaCrewOption[];
  scheduledStartMinute: number;
  elapsedMinutes: number;
  cleanerMinutes: number;
  score: number | null;
  marginEstimateCOP: number | null;
  marginalCostTotalCOP: number | null;
  totalTravelMinutes: number | null;
  featureVector: AgendaFeatureVector;
  complianceFlags: string[];
  hardBlocked: boolean;
  recommended: boolean;
}

export interface AgendaFeatureVectorStamp {
  specVersion: string;
  automationLevel: number;
  engineWeights: AgendaEngineWeights;
  costConfigVersion: string;
  travelConfigVersion: string;
}

export interface AgendaEngineResult {
  options: AgendaOption[];
  suggestedOptionId: string | null;
  featureVectorStamp: AgendaFeatureVectorStamp;
  globalFlags: string[];
}
