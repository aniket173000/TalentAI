// ── Stray CMS artifacts to filter out ────────────────────────────────────────
const JUNK_RE = [
  /^copy\s+(html\s+)?content$/i,
  /^copy\s+text$/i,
  /^copy\s+link$/i,
  /^share$/i,
]

function isJunk(line: string): boolean {
  return JUNK_RE.some(r => r.test(line.trim()))
}

// ── Top-level section header detection ───────────────────────────────────────
const HEADER_KEYWORDS = [
  'about', 'overview', 'responsibilities', 'requirements', 'qualifications',
  'skills', 'nice to have', 'preferred', 'benefits', 'what you', 'what we',
  'why join', 'your role', 'the role', 'duties', 'must have', 'description',
  'perks', 'compensation', 'experience', 'education', 'we are looking',
  'key responsibilities', 'key requirements', 'minimum qualifications',
  'preferred qualifications', 'who you are', 'job summary', 'position summary',
]

function isTopHeader(line: string): boolean {
  const t = line.trim()
  if (!t || t.length < 2) return false
  if (t.endsWith(':') && t.length <= 80 && !t.startsWith('-') && !t.startsWith('•')) return true
  if (t === t.toUpperCase() && t.length >= 3 && t.length <= 60 && /[A-Z]/.test(t)) return true
  const lower = t.toLowerCase().replace(/[?:]$/, '').trim()
  if (t.length <= 70 && HEADER_KEYWORDS.some(k => lower === k || lower.startsWith(k + ' '))) return true
  return false
}

// ── Sub-header detection (e.g. "Support Technical Project Management") ───────
function isSubHeader(line: string): boolean {
  const t = line.trim()
  if (!t || t.length < 3 || t.length > 70) return false
  if (/^[-•*·▪▸►→]/.test(t)) return false
  if (/^\d+[.)]\s/.test(t)) return false
  if (/[.,;]$/.test(t)) return false   // ends like a sentence
  if (t.endsWith(':')) return false    // already caught by isTopHeader
  const words = t.split(/\s+/).filter(w => /^[A-Za-z]/.test(w))
  if (words.length < 2 || words.length > 8) return false
  const capCount = words.filter(w => /^[A-Z]/.test(w)).length
  return capCount / words.length >= 0.7
}

function stripBullet(line: string): string {
  return line.replace(/^[-•*·▪▸►→]\s+/, '').replace(/^\d+[.)]\s+/, '').trim()
}

// ── Data types ────────────────────────────────────────────────────────────────
interface SubSection {
  header: string | null
  items: string[]
}

interface Section {
  header: string | null
  intro: string[]
  subsections: SubSection[]
}

// ── Parser ────────────────────────────────────────────────────────────────────
function parseJD(text: string): Section[] {
  const sections: Section[] = []
  let currentSection: Section = { header: null, intro: [], subsections: [] }
  let currentSub: SubSection | null = null

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || isJunk(line)) continue

    if (isTopHeader(line)) {
      if (currentSub) { currentSection.subsections.push(currentSub); currentSub = null }
      if (currentSection.header !== null || currentSection.intro.length > 0 || currentSection.subsections.length > 0) {
        sections.push(currentSection)
      }
      currentSection = { header: line.replace(/[?:]$/, '').trim(), intro: [], subsections: [] }
    } else if (isSubHeader(line)) {
      if (currentSub) currentSection.subsections.push(currentSub)
      currentSub = { header: line, items: [] }
    } else {
      const content = stripBullet(line)
      if (currentSub) {
        currentSub.items.push(content)
      } else {
        currentSection.intro.push(content)
      }
    }
  }

  if (currentSub) currentSection.subsections.push(currentSub)
  if (currentSection.header !== null || currentSection.intro.length > 0 || currentSection.subsections.length > 0) {
    sections.push(currentSection)
  }

  return sections.filter(s => s.intro.length > 0 || s.subsections.length > 0)
}

// ── Color scheme per section type ─────────────────────────────────────────────
interface Scheme { accent: string; chip: string; chipText: string; dot: string }

const SCHEMES: Array<{ keys: string[]; s: Scheme }> = [
  {
    keys: ['responsibilities', 'duties'],
    s: { accent: 'bg-blue-500', chip: 'bg-blue-100', chipText: 'text-blue-700', dot: 'bg-blue-400' },
  },
  {
    keys: ['requirements', 'qualifications', 'must have', 'minimum'],
    s: { accent: 'bg-violet-500', chip: 'bg-violet-100', chipText: 'text-violet-700', dot: 'bg-violet-400' },
  },
  {
    keys: ['nice to have', 'preferred'],
    s: { accent: 'bg-amber-500', chip: 'bg-amber-100', chipText: 'text-amber-700', dot: 'bg-amber-400' },
  },
  {
    keys: ['benefits', 'perks', 'compensation'],
    s: { accent: 'bg-emerald-500', chip: 'bg-emerald-100', chipText: 'text-emerald-700', dot: 'bg-emerald-400' },
  },
  {
    keys: ['why join', 'about us', 'company'],
    s: { accent: 'bg-pink-500', chip: 'bg-pink-100', chipText: 'text-pink-700', dot: 'bg-pink-400' },
  },
  {
    keys: ['what you', 'what we', 'learn', 'offer'],
    s: { accent: 'bg-teal-500', chip: 'bg-teal-100', chipText: 'text-teal-700', dot: 'bg-teal-400' },
  },
]

const DEFAULT_SCHEME: Scheme = {
  accent: 'bg-slate-400', chip: 'bg-slate-100', chipText: 'text-slate-600', dot: 'bg-slate-400',
}

function schemeFor(header: string | null): Scheme {
  if (!header) return DEFAULT_SCHEME
  const lower = header.toLowerCase()
  for (const { keys, s } of SCHEMES) {
    if (keys.some(k => lower.includes(k))) return s
  }
  return { accent: 'bg-brand-blue', chip: 'bg-blue-50', chipText: 'text-blue-700', dot: 'bg-blue-400' }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function JDFormatter({ text }: { text: string }) {
  const sections = parseJD(text)

  if (sections.length === 0) {
    return <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
  }

  return (
    <div className="space-y-7">
      {sections.map((section, si) => {
        const sc = schemeFor(section.header)
        const hasSubSections = section.subsections.length > 0

        return (
          <div key={si}>
            {/* Section header */}
            {section.header && (
              <div className="flex items-center gap-2.5 mb-4">
                <span className={`w-1.5 h-6 rounded-full shrink-0 ${sc.accent}`} />
                <h3 className="text-[13px] font-extrabold text-slate-800 uppercase tracking-widest">
                  {section.header}
                </h3>
              </div>
            )}

            {/* Intro — paragraph text or flat list items */}
            {section.intro.length > 0 && (
              <div className={`space-y-2 ${hasSubSections ? 'mb-5' : ''} pl-4`}>
                {section.intro.map((line, li) => (
                  <div key={li} className="flex items-start gap-2.5">
                    <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${sc.dot} opacity-60`} />
                    <p className="text-sm text-slate-600 leading-relaxed">{line}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Sub-sections */}
            {hasSubSections && (
              <div className="space-y-5 pl-2">
                {section.subsections.map((sub, si2) => (
                  <div key={si2}>
                    {/* Sub-header chip */}
                    {sub.header && (
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg mb-2.5 ${sc.chip}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        <span className={`text-xs font-bold ${sc.chipText}`}>{sub.header}</span>
                      </div>
                    )}

                    {/* Sub-section items */}
                    {sub.items.length > 0 && (
                      <ul className="space-y-1.5 pl-5">
                        {sub.items.map((item, ii) => (
                          <li key={ii} className="flex items-start gap-2.5 text-sm text-slate-600 leading-relaxed">
                            <span className={`mt-2 w-1 h-1 rounded-full shrink-0 ${sc.dot} opacity-70`} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
