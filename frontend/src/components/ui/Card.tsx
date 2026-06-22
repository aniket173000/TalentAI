import type { CSSProperties, MouseEvent, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  /** Adds the hover-lift interaction (translate + bigger hard shadow). */
  hover?: boolean
  /** Use the tinted "hero" banner background instead of plain surface. */
  hero?: boolean
  padding?: number
  radius?: number
  style?: CSSProperties
}

// Vouch — white surface, 2px ink border, hard offset shadow. The signature card.
export default function Card({
  children, onClick, hover = false, hero = false, padding = 24, radius = 22, style,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={hover ? 'vouch-card' : undefined}
      style={{
        background: hero ? 'var(--hero)' : 'var(--surface)',
        border: '2px solid var(--ink)',
        borderRadius: radius,
        boxShadow: '5px 5px 0 var(--card-shadow)',
        padding,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
