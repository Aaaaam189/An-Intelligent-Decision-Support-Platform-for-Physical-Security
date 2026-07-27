export const PRIORITY_COLORS: Record<string, string> = {
  LOW: "#35d185",
  MEDIUM: "#FFA500",
  HIGH: "#FF6347",
  CRITICAL: "#FF3B30",
} as const;

export const STATUS_COLORS: Record<string, string> = {
  PENDING: "#FFA500",
  IN_PROGRESS: "#4A90D9",
  RESOLVED: "#35d185",
  CLOSED: "#c6c5c8",
} as const;
