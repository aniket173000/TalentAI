interface Section {
  header: string | null
  lines: string[]
}

const HEADER_KEYWORDS = [
  'about', 'overview', 'responsibilities', 'requirements', 'qualifications',
  'skills', 'nice to have', 'preferred', 'benefits', 'what you', 'what we',
  'why join', 'your role', 'the role', 'duties', 'must have', 'description',
  'perks', 'compensation', 'experience', 'education', 'we are looking',
  'key responsibilities', 'key requirements', 'minimum qualifications',
  'preferred qualifications', 'who you are', 'job summary', 'position summary',
]

function isHeader(line: string): boolean {
  const t = line.trim()
  if (!t || t.length < 2) return false
  if (t.endsWith(':') && t.length <= 80 && !t.startsWith('-') && !t.startsWith('•')) return true
  if (t === t.toUpperCase() && t.length >= 3 && t.length <= 60 && /[A-Z]/.test(t)) return true
  const lower = t.toLowerCase().replace(/:$/, '').trim()
  if (t.length <= 70 && HEADER_KEYWORDS.some(k => lower === k || lower.startsWith(k + ' '))) return true
  return false
}

function stripBullet(line: string): string {
  return line.replace(/^[-•*·▪▸►→]\s+/, '').replace(/^\d+[.)]\s+/, '').trim()
}

function parseJD(text: string): Section[] {
  const sections: Section[] = []
  let current: Section = { header: null, lines: [] }

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    if (isHeader(line)) {
      if (current.lines.length > 0 || current.header) sections.push(current)
      current = { header: line.replace(/:$/, '').trim(), lines: [] }
    } else {
      current.lines.push(stripBullet(line))
    }
  }
  if (current.lines.length > 0 || current.header) sections.push(current)
  return sections.filter(s => s.lines.length > 0)
}

const SECTION_COLORS: Record<string, string> = {
  responsibilities: 'bg-blue-500',
  requirements: 'bg-violet-500',
  qualifications: 'bg-violet-500',
  benefits: 'bg-emerald-500',
  perks: 'bg-emerald-500',
  'nice to have': 'bg-amber-500',
  preferred: 'bg-amber-500',
}

function accentColor(header: string | null): string {
  if (!header) return 'bg-slate-400'
  const lower = header.toLowerCase()
  for (const [key, color] of Object.entries(SECTION_COLORS)) {
    if (lower.includes(key)) return color
  }
  return 'bg-brand-blue'
}

export default function JDFormatter({ text }: { text: string }) {
  const sections = parseJD(text)

  if (sections.length === 0) {
    return <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
  }

  return (
    <div className="space-y-6">
      {sections.map((section, i) => (
        <div key={i}>
          {section.header && (
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-1 h-5 rounded-full shrink-0 ${accentColor(section.header)}`} />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                {section.header}
              </h3>
            </div>
          )}
          <ul className="space-y-2 pl-3">
            {section.lines.map((line, j) => (
              <li key={j} className="flex items-start gap-2.5 text-sm text-slate-600 leading-relaxed">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
