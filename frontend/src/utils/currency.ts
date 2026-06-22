// Shared salary/currency formatting so every surface renders compensation the same way.

const SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

export function currencySymbol(code?: string | null): string {
  if (!code) return '$' // legacy rows created before currency existed
  return SYMBOLS[code] ?? `${code} `
}

/**
 * Format an optional salary range with its currency symbol.
 * `compact` shows values in "k" units (e.g. ₹800k). Returns '' when nothing is set.
 */
export function formatSalaryRange(
  min?: number | null,
  max?: number | null,
  currency?: string | null,
  compact = false,
): string {
  if (!min && !max) return ''
  const sym = currencySymbol(currency)
  const fmt = (n: number) =>
    compact ? `${sym}${(n / 1000).toFixed(0)}k` : `${sym}${n.toLocaleString()}`
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  if (min) return `From ${fmt(min)}`
  return `Up to ${fmt(max as number)}`
}
