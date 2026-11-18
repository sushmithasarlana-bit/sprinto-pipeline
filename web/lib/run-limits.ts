/** Guards for web-started runs on an open dashboard: they spend Gemini tokens and Hunter searches. */
export const RUN_LIMITS = {
  maxDomains: 3,
  maxRunsPerDay: 3,
  liveHunterFloor: 15,
  discoverTargets: [1, 2, 3], // qualified companies per web discovery run (each = one Hunter search)
} as const;
