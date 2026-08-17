const FIRST_START_BACKFILL = 50;

export function initialLastUid(
  existingLastUid: number | null | undefined,
  uidNext: number,
  backfill = FIRST_START_BACKFILL,
): number {
  if (existingLastUid != null) {
    return existingLastUid;
  }
  const maxUid = Math.max(0, uidNext - 1);
  return Math.max(0, maxUid - backfill);
}
