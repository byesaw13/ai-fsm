export const PRIORITY = {
  CRITICAL: 10,
  HIGH:     30,
  MEDIUM:   50,
  LOW:      70,
  INTERNAL: 90,
} as const;

export type Priority = typeof PRIORITY[keyof typeof PRIORITY];

// Cooldown bypass thresholds
export const COOLDOWN_BYPASS_MINIMUM = PRIORITY.HIGH;   // HIGH and above ignore the 4h cooldown
export const DAILY_CAP_BYPASS_MINIMUM = PRIORITY.HIGH;  // HIGH and above ignore the daily cap
