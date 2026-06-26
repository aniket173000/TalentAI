// ──────────────────────────────────────────────────────────────────────────
// Midnight Terminal (Direction B) — design tokens + helpers for the Colleges /
// campus directory page. Dark, neon, "dev-tool / terminal" aesthetic.
// Self-contained literal tokens (the global CSS vars are the light Vouch theme).
// ──────────────────────────────────────────────────────────────────────────

export type CampusMode = 'candidate' | 'recruiter'

// Fixed dark surface/border/text tokens.
export const MT = {
  bg: '#08080B',
  grid: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.045) 1px, transparent 0)',
  cardGrad: 'linear-gradient(180deg,#121419,#0B0C10)',
  panelGrad: 'linear-gradient(180deg,#13151B,#0C0D11)',
  panel: '#0C0D11',
  surface: '#101218',
  chipBg: '#15171D',
  chipLine: '#23262E',
  border: '#1B1C22',
  border2: '#20232B',
  border3: '#262932',
  track: '#1B1D24',
  text: '#E7E9EE',
  muted: '#9CA0AB',
  faint: '#7E828D',
  faint2: '#6B6F79',
  placeholder: '#4A4D57',
  onAccent: '#08080B',
  font: "'Space Grotesk', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const

// Brighter brand colors for glow-on-dark (per handoff §Data Model note). Cards
// are keyed to one of these by a stable hash of the college name.
export const BRANDS = ['#FF7A33', '#2BD17E', '#9B7BFF', '#36B7F5', '#F25ACF'] as const

// Selectable accent palette (stakeholder feature). Each palette = candidate /
// recruiter accent pair. Order matters — first is the default.
export interface Palette {
  name: string
  candidate: string
  recruiter: string
}
export const PALETTES: Palette[] = [
  { name: 'Electric Violet', candidate: '#9D7CFF', recruiter: '#2DE3C0' },
  { name: 'Plasma', candidate: '#FF6B9D', recruiter: '#7C8CFF' },
  { name: 'Sunset', candidate: '#FF8A4C', recruiter: '#FFC24B' },
  { name: 'Ice', candidate: '#5BA8FF', recruiter: '#34E0D0' },
  { name: 'Aurora', candidate: '#5BF2A8', recruiter: '#4CC9FF' },
  { name: 'Ember', candidate: '#FF6552', recruiter: '#FFB454' },
  { name: 'Bubblegum', candidate: '#FF7AD9', recruiter: '#9D7CFF' },
  { name: 'Indigo', candidate: '#7C8CFF', recruiter: '#B98CFF' },
  { name: 'Mango', candidate: '#FFD23F', recruiter: '#FF8A4C' },
  { name: 'Slate Pop', candidate: '#8FA3FF', recruiter: '#E0E4F0' },
]

// Per-mode copy. Drives headline / sub / stat labels / chips / CTA from one map.
export const MODES: Record<CampusMode, {
  headline: string; sub: string; lab2: string; lab3: string
  cta: string; chipA: string; chipB: string; pill: string
}> = {
  candidate: {
    headline: 'Find your college community',
    sub: 'Connect with students and alumni from your campus — swap referrals, notes and the inside track.',
    lab2: 'Students', lab3: 'Alumni', cta: 'Explore', chipA: 'studying', chipB: 'alumni', pill: 'Student Mode',
  },
  recruiter: {
    headline: 'Find your talent pools',
    sub: 'Discover, shortlist and source candidates from the campuses that fit your roles best.',
    lab2: 'Candidates', lab3: 'Placed', cta: 'Source', chipA: 'open', chipB: 'hireable', pill: 'Recruiter Mode',
  },
}

export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}

export function brandOf(name: string): string {
  return BRANDS[hashStr(name) % BRANDS.length]
}

// rgba(...) string from a #RRGGBB hex at alpha a.
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// 1240 → "1.2k"; values < 1000 shown raw.
export function kfmt(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
}
