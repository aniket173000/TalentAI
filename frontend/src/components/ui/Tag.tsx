import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

export type TagTone = 'neutral' | 'match' | 'longshot' | 'full'

interface TagProps {
  icon?: IconName | 'mono'
  children: ReactNode
  tone?: TagTone
}

const TONES: Record<TagTone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: 'var(--surface-2)', fg: 'var(--muted)', bd: 'var(--line)' },
  match: { bg: 'var(--green-soft)', fg: 'var(--green-ink)', bd: 'var(--green-line)' },
  longshot: { bg: 'var(--amber-soft)', fg: 'var(--amber-ink)', bd: 'var(--amber-line)' },
  full: { bg: 'var(--red-soft)', fg: 'var(--red-ink)', bd: 'var(--red-line)' },
}

export default function Tag({ icon, children, tone = 'neutral' }: TagProps) {
  const t = TONES[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700,
      background: t.bg, color: t.fg, border: `1.5px solid ${t.bd}`,
      fontFamily: icon === 'mono' ? 'var(--font-mono)' : 'var(--font-body)', whiteSpace: 'nowrap',
    }}>
      {icon && icon !== 'mono' && <Icon name={icon} size={13} stroke={2.4} />}
      {children}
    </span>
  )
}
