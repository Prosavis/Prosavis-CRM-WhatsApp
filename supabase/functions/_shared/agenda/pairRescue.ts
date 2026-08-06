import type { CleanerAgendaSnapshot, MinuteWindow } from "./types.ts";

export interface PairEligibleCleaner {
  cleaner: CleanerAgendaSnapshot;
  windows: MinuteWindow[];
}

export interface PairRescueCandidate {
  cleanerIds: [string, string];
  startMinute: number;
  endMinute: number;
  residualMinutes: number;
}

export function buildPairRescueCandidates(
  eligible: PairEligibleCleaner[],
  memberMinutes: number,
): PairRescueCandidate[] {
  if (!Number.isInteger(memberMinutes) || memberMinutes <= 0) return [];

  const sorted = [...eligible]
    .filter(({ cleaner }) => cleaner.acceptsComposite)
    .sort((a, b) => a.cleaner.cleanerId.localeCompare(b.cleaner.cleanerId));
  const pairs: PairRescueCandidate[] = [];

  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      const a = sorted[left];
      const b = sorted[right];
      const overlaps: PairRescueCandidate[] = [];

      for (const aWindow of a.windows) {
        for (const bWindow of b.windows) {
          const startMinute = Math.max(
            aWindow.startMinute,
            bWindow.startMinute,
          );
          const overlapEnd = Math.min(aWindow.endMinute, bWindow.endMinute);
          if (overlapEnd - startMinute < memberMinutes) continue;
          overlaps.push({
            cleanerIds: [a.cleaner.cleanerId, b.cleaner.cleanerId],
            startMinute,
            endMinute: startMinute + memberMinutes,
            residualMinutes:
              aWindow.endMinute - aWindow.startMinute - memberMinutes +
              (bWindow.endMinute - bWindow.startMinute - memberMinutes),
          });
        }
      }

      overlaps.sort((aOverlap, bOverlap) =>
        aOverlap.startMinute - bOverlap.startMinute ||
        aOverlap.residualMinutes - bOverlap.residualMinutes
      );
      if (overlaps[0]) pairs.push(overlaps[0]);
    }
  }

  return pairs;
}
