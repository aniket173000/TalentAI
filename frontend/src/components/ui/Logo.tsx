import type { CSSProperties } from 'react'

interface LogoProps {
  size?: number
  /** Render the "Nideknil" wordmark next to the mark (default true). */
  wordmark?: boolean
  /** Dark-surface variant: white mark + white "Ni" (with sky "deknil"). */
  dark?: boolean
}

const SKY = '#4CB2FF'

// Nideknil — "flip arrows" logomark (reverse / re-match motif) + two-tone wordmark.
// Mark is sky on light surfaces, white on dark; "Ni" is ink/white, "deknil" always sky.
export default function Logo({ size = 22, wordmark = true, dark = false }: LogoProps) {
  const markStroke = dark ? '#ffffff' : SKY
  const wordColor = dark ? '#ffffff' : 'var(--ink)'
  const wordStyle: CSSProperties = {
    fontFamily: "'Space Grotesk', var(--font-display), sans-serif",
    fontWeight: 700,
    fontSize: size,
    letterSpacing: '-0.04em',
    lineHeight: 1,
    color: wordColor,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <svg width={size + 8} height={size + 8} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <g stroke={markStroke} strokeWidth={5.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M49 27 A19 19 0 0 0 15 23" />
          <path d="M15 37 A19 19 0 0 0 49 41" />
          <path d="M50 13 L50 27 L37 27" />
          <path d="M14 51 L14 37 L27 37" />
        </g>
      </svg>
      {wordmark && (
        <span style={wordStyle}>
          Ni<span style={{ color: SKY }}>deknil</span>
        </span>
      )}
    </div>
  )
}
