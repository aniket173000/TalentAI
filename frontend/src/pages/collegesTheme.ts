// ──────────────────────────────────────────────────────────────────────────
// Campus directory design tokens — now theme-aware (dark + light).
//
// The original "Midnight Terminal" dark, neon, dev-tool aesthetic lives in
// THEMES.dark. THEMES.light is a calm, paper-bright counterpart that keeps the
// same terminal/monospace character but reads cleanly on white. Both objects
// share an identical key set so components can swap between them freely.
// ──────────────────────────────────────────────────────────────────────────

export type CampusMode = 'candidate' | 'recruiter'
export type ThemeMode = 'dark' | 'light'

const FONT = "'Space Grotesk', system-ui, sans-serif"
const MONO = "'JetBrains Mono', ui-monospace, monospace"

// ── Dark theme (Midnight Terminal) ───────────────────────────────────────────
export const MT_DARK = {
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
  // Extended tokens (shared key set with light)
  statBorder: '#1F2128',
  divider: '#1C1E25',
  dashed: '#2A2D36',
  chipText: '#C7CAD2',
  chipTextStrong: '#FFFFFF',
  success: '#2BD17E',
  danger: '#FF8A8A',
  accentBlue: '#36B7F5',
  accentPurple: '#9B7BFF',
  linkedin: '#4DA3F0',
  overlay: 'rgba(8,8,11,0.78)',
  shadowStrong: 'rgba(0,0,0,0.8)',
  shadowCard: 'rgba(0,0,0,0.6)',
  glowAlpha: 0.5,
  font: FONT,
  mono: MONO,
}

export type Theme = typeof MT_DARK

// ── Light theme (Paper Terminal) ─────────────────────────────────────────────
// Soft off-white surfaces, near-black ink, hairline cool-grey borders. Tuned so
// monospace labels and chips stay legible and the page feels crisp, not stark.
export const MT_LIGHT: Theme = {
  bg: '#F6F7F9',
  grid: 'radial-gradient(circle at 1px 1px, rgba(15,23,42,.05) 1px, transparent 0)',
  cardGrad: 'linear-gradient(180deg,#FFFFFF,#F7F8FA)',
  panelGrad: 'linear-gradient(180deg,#FFFFFF,#F3F4F7)',
  panel: '#FFFFFF',
  surface: '#FFFFFF',
  chipBg: '#F1F2F5',
  chipLine: '#E3E5EB',
  border: '#E7E9EE',
  border2: '#E2E4EA',
  border3: '#D6D9E0',
  track: '#EAECF1',
  text: '#15171C',
  muted: '#565B66',
  faint: '#787E89',
  faint2: '#969BA5',
  placeholder: '#AAAEB8',
  onAccent: '#FFFFFF',
  statBorder: '#E5E7EC',
  divider: '#ECEEF2',
  dashed: '#D2D6DE',
  chipText: '#565B66',
  chipTextStrong: '#15171C',
  success: '#0E9F6E',
  danger: '#D92D32',
  accentBlue: '#1B81CE',
  accentPurple: '#6D4FD6',
  linkedin: '#2A6FB8',
  overlay: 'rgba(20,22,28,0.32)',
  shadowStrong: 'rgba(15,23,42,0.18)',
  shadowCard: 'rgba(15,23,42,0.12)',
  glowAlpha: 0.22,
  font: FONT,
  mono: MONO,
}

export const THEMES: Record<ThemeMode, Theme> = { dark: MT_DARK, light: MT_LIGHT }

// Back-compat default export (dark). Existing references to `MT` resolve here.
export const MT = MT_DARK

// Brighter brand colors for glow-on-dark (per handoff §Data Model note). Cards
// are keyed to one of these by a stable hash of the college name. They read as
// vivid accents on both themes (used as top bars, tile borders + tints).
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

// WCAG relative luminance (0 = black, 1 = white) for a #RRGGBB hex.
export function relLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.4722 * ch[2]
}

// The palette accents are tuned for neon-on-black; several (teal, mango, ice)
// are far too light to read as text/links or to carry white button text on a
// white page. For light mode we darken the accent until its luminance is low
// enough for ~4:1 contrast against white, preserving hue. Dark mode returns the
// raw neon unchanged.
export function readableAccent(hex: string, mode: ThemeMode): string {
  if (mode === 'dark') return hex
  let n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  // Scale toward black in small steps until dark enough.
  for (let i = 0; i < 24 && relLuminance(`#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`) > 0.22; i++) {
    r = Math.round(r * 0.92); g = Math.round(g * 0.92); b = Math.round(b * 0.92)
  }
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// 1240 → "1.2k"; values < 1000 shown raw.
export function kfmt(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
}
