// Utility helpers for displaying Basename or falling back to an address
// Strict TypeScript, minimal dependencies

export type AddressHex = `0x${string}`

export function truncateAddress(address: string | null | undefined): string {
  const a = (address || '').toString()
  if (!a || a.length < 10) return a || ''
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

export function isBasename(name: string | null | undefined): boolean {
  const n = (name || '').toLowerCase().trim()
  return !!n && (n.endsWith('.base.eth') || n.includes('.base.eth'))
}

export function normalizeBasename(name: string | null | undefined): string {
  const raw = (name || '').trim()
  if (!raw) return ''
  const n = raw.toLowerCase()
  // If user provided without the full suffix, add it
  if (!n.endsWith('.base.eth')) return `${raw}.base.eth`
  return raw
}

export function displayName(name: string | null | undefined, address: string | null | undefined): string {
  const n = (name || '').trim()
  if (n) return n
  return truncateAddress(address)
}