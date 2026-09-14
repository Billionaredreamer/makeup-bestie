export const PLUS_MONTHLY_SESSION_LIMIT = 15;

export const PLUS_ALLOWANCE_COPY = "15 lesson sessions a month, including replays";

export const UNLIMITED_ALLOWANCE_COPY = "Unlimited adaptations, including replays";

export function plusSessionsLeft(used: number | null | undefined) {
  return Math.max(0, PLUS_MONTHLY_SESSION_LIMIT - (used ?? 0));
}

export function plusSessionsLeftCopy(used: number | null | undefined) {
  return `${plusSessionsLeft(used)} of ${PLUS_MONTHLY_SESSION_LIMIT} sessions left`;
}
