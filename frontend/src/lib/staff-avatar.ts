import type { User } from '@/types'

/** Twemoji PNGs (jsDelivr) — used when no profile_image_url is set */
const FALLBACK_TWEMOJI = [
  '1f600',
  '1f603',
  '1f604',
  '1f601',
  '1f606',
  '1f60a',
  '1f973',
  '1f917',
] as const

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Resolved avatar URL: saved profile link, or a stable friendly Twemoji per user id */
export function staffAvatarImageUrl(user: Pick<User, 'id'> & { profile_image_url?: string | null }): string {
  const u = user.profile_image_url?.trim()
  if (u) return u
  const code = FALLBACK_TWEMOJI[hashId(String(user.id)) % FALLBACK_TWEMOJI.length]
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code}.png`
}
