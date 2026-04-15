/** Line items waiting for Fire KOT — dine-in uses `draft`; takeout/delivery use `pending` after create. */
export function isKotUnsentStatus(status: string): boolean {
  return status === 'draft' || status === 'pending'
}
