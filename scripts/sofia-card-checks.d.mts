// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Card = Record<string, any>;

export interface MoldReview {
  phone: string;
  verdict: 'correcto' | 'error';
}

export interface SinCampoCandidate {
  tipo: string;
  fichas: number;
}

export interface MoldInput {
  closedProblems: number;
  copied: number;
  health: number;
  blocked: number;
  reviews?: MoldReview[];
  candidates?: SinCampoCandidate[];
}

export interface MoldResult {
  automaticPass: boolean;
  humanPass: boolean;
  reviewed: number;
  correctionRate: number | null;
  candidates: SinCampoCandidate[];
}

export function phoneKey(value: unknown): string;
export function closedValueProblems(card: Card | null | undefined): string[];
export function blockedFieldViolations(current: Card | null | undefined, diff: unknown, path?: string): string[];
export function copiesLiveFacts(
  card: Card | null | undefined,
  appointments: Array<{ scheduledDate?: unknown; price?: unknown }> | null | undefined,
): boolean;
export function hasHealthData(card: Card | null | undefined): boolean;
export function sinCampoCandidates(cards: Card[]): SinCampoCandidate[];
export function applyCardDiff(current: Card | null | undefined, diff: unknown): Card;
export function evaluateMold(input: MoldInput): MoldResult;
