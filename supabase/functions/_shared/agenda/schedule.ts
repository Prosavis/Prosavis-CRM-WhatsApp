import type { MinuteWindow } from "./types.ts";

const BOGOTA_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Bogota",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function bogotaMinuteOfDay(isoTimestamp: string): number | null {
  const date = new Date(isoTimestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = BOGOTA_TIME_FORMATTER.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour * 60 + minute;
}

export function subtractOccupiedWindows(
  availability: MinuteWindow[],
  occupied: MinuteWindow[],
): MinuteWindow[] {
  const sortedOccupied = occupied
    .filter((window) => window.startMinute < window.endMinute)
    .sort((a, b) => a.startMinute - b.startMinute);

  return availability.flatMap((available) => {
    let fragments: MinuteWindow[] = [{ ...available }];
    for (const busy of sortedOccupied) {
      fragments = fragments.flatMap((fragment) => {
        if (
          busy.endMinute <= fragment.startMinute ||
          busy.startMinute >= fragment.endMinute
        ) {
          return [fragment];
        }
        const result: MinuteWindow[] = [];
        if (busy.startMinute > fragment.startMinute) {
          result.push({
            startMinute: fragment.startMinute,
            endMinute: busy.startMinute,
          });
        }
        if (busy.endMinute < fragment.endMinute) {
          result.push({
            startMinute: busy.endMinute,
            endMinute: fragment.endMinute,
          });
        }
        return result;
      });
    }
    return fragments;
  }).filter((window) => window.startMinute < window.endMinute);
}

export function operationalDateUtcRange(date: string): {
  start: string;
  end: string;
} {
  const start = new Date(`${date}T00:00:00-05:00`);
  if (!Number.isFinite(start.getTime())) throw new Error("date_invalid");
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
