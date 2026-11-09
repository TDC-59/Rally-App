// Timezone helpers. All instants are unix seconds UTC (ADR 0004).
// Step 4 adds wall-clock <-> UTC conversion with the DST gap/overlap policy.

export function isValidTimeZone(tz: string): boolean {
  if (!tz || !tz.includes('/') && tz !== 'UTC') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** US zones first (that's who's using this), then everything else the runtime knows. */
export const COMMON_ZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
];

export function allZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const all = intl.supportedValuesOf?.('timeZone') ?? [];
  return all.filter((z) => !COMMON_ZONES.includes(z));
}
