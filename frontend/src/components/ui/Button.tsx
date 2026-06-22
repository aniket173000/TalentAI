import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

export type ButtonVariant = 'primary' | 'dark' | 'ghost' | 'soft'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps {
  children?: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  iconRight?: IconName
  full?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  style?: CSSProperties
}

const SIZES: Record<ButtonSize, { p: string; f: number }> = {
  sm: { p: '9px 14px', f: 13.5 },
  md: { p: '13px 20px', f: 15 },
  lg: { p: '16px 26px', f: 16.5 },
}

const VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--violet)', color: '#fff', boxShadow: '4px 4px 0 var(--ink)' },
  dark: { background: 'var(--ink)', color: 'var(--bg)', boxShadow: '4px 4px 0 var(--violet)' },
  ghost: { background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'none' },
  soft: { background: 'var(--surface-2)', color: 'var(--ink)', border: '2px solid var(--line)', boxShadow: 'none' },
}

export default function Button({
  children, onClick, variant = 'primary', size = 'md',
  icon, iconRight, full, disabled, type = 'button', style,
}: ButtonProps) {
  const s = SIZES[size]
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    padding: s.p, fontSize: s.f, fontWeight: 800, fontFamily: 'var(--font-display)',
    borderRadius: 14, cursor: disabled ? 'not-allowed' : 'pointer', border: '2px solid var(--ink)',
    width: full ? '100%' : 'auto', letterSpacing: '-0.01em',
    transition: 'transform .12s ease, box-shadow .12s ease, background .15s ease',
    opacity: disabled ? 0.45 : 1, ...style,
  }
  const press = (e: MouseEvent<HTMLButtonElement>, on: boolean) => {
    if (disabled) return
    e.currentTarget.style.transform = on ? 'translate(2px,2px)' : 'none'
  }
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      style={{ ...base, ...VARIANTS[variant] }}
      onMouseDown={(e) => press(e, true)}
      onMouseUp={(e) => press(e, false)}
      onMouseLeave={(e) => press(e, false)}
    >
      {icon && <Icon name={icon} size={s.f + 2} stroke={2.4} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.f + 2} stroke={2.4} />}
    </button>
  )
}
