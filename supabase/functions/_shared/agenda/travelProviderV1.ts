import type {
  TravelConfig,
  TravelLocation,
  TravelMatrixEntry,
} from "./types.ts";

export interface TravelRequest {
  origin: TravelLocation;
  destination: TravelLocation;
  departureHour: number;
  matrix: TravelMatrixEntry[];
}

export interface TravelEstimate {
  status: "ready" | "blocked";
  minutes: number | null;
  source: "matrix_learned" | "matrix_seed" | "haversine" | "blocked";
  flags: string[];
}

function normalizeComuna(value: string | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase("es-CO");
  return normalized || null;
}

function finiteCoordinate(
  value: number | undefined,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum;
}

function haversineKm(origin: TravelLocation, destination: TravelLocation) {
  if (
    !finiteCoordinate(origin.lat, -90, 90) ||
    !finiteCoordinate(origin.lng, -180, 180) ||
    !finiteCoordinate(destination.lat, -90, 90) ||
    !finiteCoordinate(destination.lng, -180, 180)
  ) {
    return null;
  }

  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(destination.lat - origin.lat);
  const deltaLng = radians(destination.lng - origin.lng);
  const originLat = radians(origin.lat);
  const destinationLat = radians(destination.lat);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(originLat) * Math.cos(destinationLat) *
      Math.sin(deltaLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function matrixEntryFor(request: TravelRequest): TravelMatrixEntry | null {
  const origin = normalizeComuna(request.origin.comuna);
  const destination = normalizeComuna(request.destination.comuna);
  if (!origin || !destination) return null;

  return request.matrix.find((entry) =>
    normalizeComuna(entry.originComuna) === origin &&
    normalizeComuna(entry.destinationComuna) === destination &&
    entry.hourBucket === request.departureHour &&
    Number.isFinite(entry.minutesEstimate) &&
    entry.minutesEstimate > 0 &&
    Number.isInteger(entry.sampleCount) &&
    entry.sampleCount >= 0
  ) ?? null;
}

export function getTravelMinutes(
  request: TravelRequest,
  config: TravelConfig,
): TravelEstimate {
  const flags: string[] = [];
  if (
    !Number.isInteger(request.departureHour) ||
    request.departureHour < 0 ||
    request.departureHour > 23
  ) {
    return {
      status: "blocked",
      minutes: null,
      source: "blocked",
      flags: ["invalid_departure_hour"],
    };
  }

  const entry = matrixEntryFor(request);
  if (entry) {
    if (
      config.learnedSampleThreshold === undefined ||
      !Number.isInteger(config.learnedSampleThreshold) ||
      config.learnedSampleThreshold < 1
    ) {
      return {
        status: "blocked",
        minutes: null,
        source: "blocked",
        flags: ["missing_or_invalid_learned_sample_threshold"],
      };
    }
    return {
      status: "ready",
      minutes: Math.round(entry.minutesEstimate),
      source: entry.sampleCount >= config.learnedSampleThreshold
        ? "matrix_learned"
        : "matrix_seed",
      flags,
    };
  }

  if (
    config.fallbackUrbanKmh === undefined ||
    !Number.isFinite(config.fallbackUrbanKmh) ||
    config.fallbackUrbanKmh <= 0
  ) {
    flags.push("missing_or_invalid_fallback_urban_kmh");
  }
  if (
    config.minimumFallbackMinutes === undefined ||
    !Number.isFinite(config.minimumFallbackMinutes) ||
    config.minimumFallbackMinutes < 0
  ) {
    flags.push("missing_or_invalid_minimum_fallback_minutes");
  }
  const distanceKm = haversineKm(request.origin, request.destination);
  if (distanceKm === null) flags.push("travel_coordinates_missing");

  if (
    flags.length > 0 ||
    config.fallbackUrbanKmh === undefined ||
    config.minimumFallbackMinutes === undefined ||
    distanceKm === null
  ) {
    return {
      status: "blocked",
      minutes: null,
      source: "blocked",
      flags,
    };
  }

  return {
    status: "ready",
    minutes: Math.max(
      config.minimumFallbackMinutes,
      Math.ceil(distanceKm / config.fallbackUrbanKmh * 60),
    ),
    source: "haversine",
    flags: [],
  };
}

export function applyTravelObservation(
  current: { minutesEstimate: number; sampleCount: number } | null,
  observedMinutes: number,
  alpha: number,
): { minutesEstimate: number; sampleCount: number } {
  if (!Number.isFinite(observedMinutes) || observedMinutes <= 0) {
    throw new Error("observed_minutes_invalid");
  }
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
    throw new Error("ewma_alpha_invalid");
  }
  if (!current) {
    return {
      minutesEstimate: Math.round(observedMinutes * 100) / 100,
      sampleCount: 1,
    };
  }
  if (
    !Number.isFinite(current.minutesEstimate) ||
    current.minutesEstimate <= 0 ||
    !Number.isInteger(current.sampleCount) ||
    current.sampleCount < 0
  ) {
    throw new Error("current_travel_estimate_invalid");
  }
  return {
    minutesEstimate: Math.round(
      (
        observedMinutes * alpha +
        current.minutesEstimate * (1 - alpha)
      ) * 100,
    ) / 100,
    sampleCount: current.sampleCount + 1,
  };
}
