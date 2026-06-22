import type { CSSProperties, ReactElement } from 'react'

// Vouch — simple 24×24 stroke-only line icons. Match this minimal style; do not
// substitute a heavier icon set.
export type IconName =
  | 'check' | 'x' | 'arrow' | 'back' | 'search' | 'bolt' | 'lock' | 'pin'
  | 'bag' | 'clock' | 'shield' | 'spark' | 'users' | 'trophy' | 'bell'
  | 'building' | 'chevron' | 'star' | 'alert' | 'plus' | 'sliders'

const PATHS: Record<IconName, ReactElement> = {
  check: <polyline points="20 6 9 17 4 12" />,
  x: <g><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></g>,
  arrow: <g><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></g>,
  back: <g><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></g>,
  search: <g><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></g>,
  bolt: <polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2" />,
  lock: <g><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></g>,
  pin: <g><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></g>,
  bag: <g><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a4 4 0 0 1 8 0v2" /></g>,
  clock: <g><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" /></g>,
  shield: <g><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><polyline points="9 12 11 14 15 10" /></g>,
  spark: <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" />,
  users: <g><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5.5" /><path d="M17.5 14.5A6 6 0 0 1 21 20" /></g>,
  trophy: <g><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3" /><path d="M17 6h3v1a3 3 0 0 1-3 3" /><line x1="12" y1="13" x2="12" y2="17" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="10" y1="17" x2="14" y2="17" /></g>,
  bell: <g><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></g>,
  building: <g><rect x="4" y="3" width="16" height="18" rx="1.5" /><line x1="9" y1="7" x2="9" y2="7.01" /><line x1="15" y1="7" x2="15" y2="7.01" /><line x1="9" y1="11" x2="9" y2="11.01" /><line x1="15" y1="11" x2="15" y2="11.01" /><line x1="9" y1="15" x2="9" y2="15.01" /><line x1="15" y1="15" x2="15" y2="15.01" /></g>,
  chevron: <polyline points="6 9 12 15 18 9" />,
  star: <polygon points="12 3 14.6 9 21 9.5 16 13.8 17.6 20 12 16.5 6.4 20 8 13.8 3 9.5 9.4 9" />,
  alert: <g><path d="M12 3l9 16H3z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="17" x2="12" y2="17.01" /></g>,
  plus: <g><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></g>,
  sliders: <g><line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" /><circle cx="9" cy="8" r="2.4" /><circle cx="15" cy="16" r="2.4" /></g>,
}

interface IconProps {
  name: IconName
  size?: number
  stroke?: number
  style?: CSSProperties
  className?: string
}

export default function Icon({ name, size = 20, stroke = 2, style, className }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
      strokeLinejoin="round" style={style} className={className} aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
