/**
 * Single source of truth for void reasons.
 *
 * Used by both the manager-PIN void modal and the admin void log filter so the
 * dropdown values always match what gets persisted in `void_log.reason`.
 */
export const VOID_REASONS = [
  'Customer Request',
  'Kitchen Error',
  'Wrong Order',
  'Manager Decision',
  'Quality Issue',
  'Other',
] as const

export type VoidReason = (typeof VOID_REASONS)[number]
