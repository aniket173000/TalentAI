import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import {
  CareerProfile, CareerUpgradeArea, EducationRecord,
  UserProfile, VaultResume, WorkExperience,
} from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 36 }, (_, i) => CURRENT_YEAR + 1 - i)

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function companyBadge(company: string): string {
  const palettes = [
    'bg-blue-100 text-blue-700',
    'bg-violet-100 text-violet-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-indigo-100 text-indigo-700',
    'bg-teal-100 text-teal-700',
    'bg-orange-100 text-orange-700',
  ]
  return palettes[company.charCodeAt(0) % palettes.length]
}

function formatDateRange(we: WorkExperience): string {
  const start = we.start_month
    ? `${MONTH_NAMES[we.start_month - 1]} ${we.start_year}`
    : `${we.start_year}`
  const end = we.is_current
    ? 'Present'
    : we.end_year
      ? (we.end_month ? `${MONTH_NAMES[we.end_month - 1]} ${we.end_year}` : `${we.end_year}`)
      : 'Present'
  return `${start} – ${end}`
}

function calcDuration(we: WorkExperience): string {
  const start = new Date(we.start_year, (we.start_month || 1) - 1)
  const end = we.is_current || !we.end_year
    ? new Date()
    : new Date(we.end_year, (we.end_month || 12) - 1)
  const total = Math.max(0,
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
  )
  const yrs = Math.floor(total / 12)
  const mos = total % 12
  if (yrs === 0 && mos === 0) return '< 1 mo'
  if (yrs === 0) return `${mos} mo`
  if (mos === 0) return `${yrs} yr`
  return `${yrs} yr ${mos} mo`
}

function totalYearsOfExperience(wes: WorkExperience[]): number {
  // Sum each role's span in months, then convert to years (1 decimal).
  let months = 0
  for (const we of wes) {
    const start = new Date(we.start_year, (we.start_month || 1) - 1)
    const end = we.is_current || !we.end_year
      ? new Date()
      : new Date(we.end_year, (we.end_month || 12) - 1)
    months += Math.max(0,
      (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
    )
  }
  return Math.round((months / 12) * 10) / 10
}

// Split a work-experience description into clean bullet lines. Strips leading
// bullet markers (•, -, *, ·) and blank lines. Falls back to sentence-splitting
// when the text is one long blob so it still renders as tidy bullets.
function descriptionBullets(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*[•\-*·]\s*/, '').trim())
    .filter(Boolean)
  if (lines.length > 1) return lines
  // Single line: break on sentence boundaries so a paragraph still bullets nicely.
  const sentences = (lines[0] ?? text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(s => s.trim())
    .filter(Boolean)
  return sentences
}

function WEDescription({ text }: { text: string }) {
  const bullets = descriptionBullets(text)
  if (bullets.length <= 1) {
    return <p className="text-sm text-slate-600 mt-2 leading-relaxed">{bullets[0] ?? text}</p>
  }
  return (
    <ul className="mt-2 space-y-1">
      {bullets.map((b, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-600 leading-relaxed">
          <span className="text-brand-blue mt-0.5 shrink-0">•</span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Work experience form state ────────────────────────────────────────────────

interface WEForm {
  company: string; title: string; location: string
  start_month: string; start_year: string
  end_month: string; end_year: string
  is_current: boolean; description: string
}

const blankWEForm: WEForm = {
  company: '', title: '', location: '',
  start_month: '', start_year: '',
  end_month: '', end_year: '',
  is_current: false, description: '',
}

function weToForm(we: WorkExperience): WEForm {
  return {
    company: we.company,
    title: we.title,
    location: we.location ?? '',
    start_month: we.start_month ? String(we.start_month) : '',
    start_year: String(we.start_year),
    end_month: we.end_month ? String(we.end_month) : '',
    end_year: we.end_year ? String(we.end_year) : '',
    is_current: we.is_current,
    description: we.description ?? '',
  }
}

function formToPayload(f: WEForm) {
  return {
    company: f.company.trim(),
    title: f.title.trim(),
    location: f.location.trim() || null,
    start_month: f.start_month ? parseInt(f.start_month) : null,
    start_year: parseInt(f.start_year),
    end_month: f.is_current ? null : (f.end_month ? parseInt(f.end_month) : null),
    end_year: f.is_current ? null : (f.end_year ? parseInt(f.end_year) : null),
    is_current: f.is_current,
    description: f.description.trim() || null,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  title, action, children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h2 className="font-bold text-slate-900 text-base">{title}</h2>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function MonthYearSelect({
  monthVal, yearVal, onMonthChange, onYearChange, disabled,
}: {
  monthVal: string; yearVal: string
  onMonthChange: (v: string) => void; onYearChange: (v: string) => void
  disabled?: boolean
}) {
  const sel = 'border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition bg-white'
  return (
    <div className="flex gap-2">
      <select value={monthVal} onChange={e => onMonthChange(e.target.value)} disabled={disabled} className={sel}>
        <option value="">Month</option>
        {MONTH_NAMES.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
      </select>
      <select value={yearVal} onChange={e => onYearChange(e.target.value)} disabled={disabled} className={sel}>
        <option value="">Year</option>
        {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  )
}

function WEFormPanel({
  form, onChange, onSave, onCancel, saving, error, isEdit,
}: {
  form: WEForm
  onChange: (f: WEForm) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  error: string | null
  isEdit: boolean
}) {
  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition'
  const set = (k: keyof WEForm, v: string | boolean) => onChange({ ...form, [k]: v })
  const canSave = form.company.trim() && form.title.trim() && form.start_year && !saving

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-700">{isEdit ? 'Edit position' : 'Add position'}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Job Title *</label>
          <input value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="Software Engineer" className={inp} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Company *</label>
          <input value={form.company} onChange={e => set('company', e.target.value)}
            placeholder="Google" className={inp} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Location</label>
        <input value={form.location} onChange={e => set('location', e.target.value)}
          placeholder="San Francisco, CA · Remote" className={inp} />
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input type="checkbox" checked={form.is_current}
          onChange={e => set('is_current', e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue" />
        <span className="text-sm text-slate-700 font-medium">I currently work here</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Start date *</label>
          <MonthYearSelect monthVal={form.start_month} yearVal={form.start_year}
            onMonthChange={v => set('start_month', v)} onYearChange={v => set('start_year', v)} />
        </div>
        {!form.is_current && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">End date</label>
            <MonthYearSelect monthVal={form.end_month} yearVal={form.end_year}
              onMonthChange={v => set('end_month', v)} onYearChange={v => set('end_year', v)} />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)}
          rows={3} placeholder="Brief summary of your role and impact…"
          className={inp + ' resize-none'} />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2.5 pt-1">
        <button onClick={onCancel} disabled={saving}
          className="flex-1 border border-slate-200 text-slate-600 font-semibold rounded-lg py-2.5 text-sm hover:bg-slate-100 transition disabled:opacity-40">
          Cancel
        </button>
        <button onClick={onSave} disabled={!canSave}
          className="flex-1 bg-brand-blue hover:bg-blue-600 text-white font-semibold rounded-lg py-2.5 text-sm transition disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add position'}
        </button>
      </div>
    </div>
  )
}

function EduFormPanel({
  institution, degree, field, gradYear, isGraduated, isPrimary, showPrimaryToggle,
  setInstitution, setDegree, setField, setGradYear, setIsGraduated, setIsPrimary,
  onSave, onCancel, saving, error, isEdit,
}: {
  institution: string; degree: string; field: string; gradYear: string
  isGraduated: boolean; isPrimary: boolean; showPrimaryToggle: boolean
  setInstitution: (v: string) => void; setDegree: (v: string) => void
  setField: (v: string) => void; setGradYear: (v: string) => void
  setIsGraduated: (v: boolean) => void; setIsPrimary: (v: boolean) => void
  onSave: () => void; onCancel: () => void
  saving: boolean; error: string | null; isEdit: boolean
}) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-3">
      <p className="text-sm font-semibold text-slate-700">{isEdit ? 'Edit education' : 'Add education'}</p>
      <Field label="Institution *">
        <input value={institution} onChange={e => setInstitution(e.target.value)}
          placeholder="MIT, Stanford, IIT Bombay…" className={INP} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Degree">
          <select value={degree} onChange={e => setDegree(e.target.value)} className={INP}>
            <option value="">Select degree</option>
            {['Bachelor', 'Master', 'PhD', 'Diploma', 'Associate', 'Other'].map(d =>
              <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Field of Study">
          <input value={field} onChange={e => setField(e.target.value)}
            placeholder="Computer Science" className={INP} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Graduation Year">
          <select value={gradYear} onChange={e => setGradYear(e.target.value)} className={INP}>
            <option value="">Select year</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <div className="flex items-center gap-3 h-10">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={isGraduated} onChange={() => setIsGraduated(true)}
                className="text-brand-blue" />
              <span className="text-sm text-slate-700">Graduated</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!isGraduated} onChange={() => setIsGraduated(false)}
                className="text-brand-blue" />
              <span className="text-sm text-slate-700">Current student</span>
            </label>
          </div>
        </Field>
      </div>
      {showPrimaryToggle && (
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue" />
          <span className="text-sm text-slate-700 font-medium">Show this as my primary credential</span>
        </label>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} disabled={saving}
          className="flex-1 border border-slate-200 text-slate-600 font-semibold rounded-xl py-2.5 text-sm hover:bg-slate-50 transition disabled:opacity-40">
          Cancel
        </button>
        <button onClick={onSave} disabled={saving || !institution.trim()}
          className="flex-1 bg-brand-blue hover:bg-blue-600 text-white font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add education'}
        </button>
      </div>
    </div>
  )
}

type ImportEntry = { we: Partial<WorkExperience>; selected: boolean }

function ImportModal({
  entries, onToggle, onConfirm, onCancel, saving,
}: {
  entries: ImportEntry[]
  onToggle: (i: number) => void
  onConfirm: () => void
  onCancel: () => void
  saving: boolean
}) {
  const selectedCount = entries.filter(e => e.selected).length

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-lg">Import from resume</h3>
          <p className="text-sm text-slate-500 mt-0.5">Select positions to add to your profile.</p>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No work experience found in your resume.</p>
          ) : entries.map((entry, i) => (
            <label key={i} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
              entry.selected ? 'border-brand-blue bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'
            }`}>
              <input type="checkbox" checked={entry.selected} onChange={() => onToggle(i)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{entry.we.title}</p>
                <p className="text-sm text-slate-500 truncate">{entry.we.company}</p>
                {entry.we.start_year && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {entry.we.start_month ? MONTH_NAMES[entry.we.start_month - 1] + ' ' : ''}{entry.we.start_year}
                    {' – '}
                    {entry.we.is_current ? 'Present' : entry.we.end_year || 'Present'}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onCancel} disabled={saving}
            className="flex-1 border border-slate-200 text-slate-600 font-semibold rounded-xl py-2.5 text-sm hover:bg-slate-50 transition disabled:opacity-40">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={selectedCount === 0 || saving}
            className="flex-1 bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition">
            {saving ? 'Adding…' : `Add ${selectedCount || ''} ${selectedCount === 1 ? 'position' : 'positions'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

type EduImportEntry = { ed: Partial<EducationRecord>; selected: boolean }

function EduImportModal({
  entries, onToggle, onConfirm, onCancel, saving,
}: {
  entries: EduImportEntry[]
  onToggle: (i: number) => void
  onConfirm: () => void
  onCancel: () => void
  saving: boolean
}) {
  const selectedCount = entries.filter(e => e.selected).length
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-lg">Import education from resume</h3>
          <p className="text-sm text-slate-500 mt-0.5">Select the colleges to add to your profile.</p>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No education found in your resume.</p>
          ) : entries.map((entry, i) => (
            <label key={i} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
              entry.selected ? 'border-brand-blue bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'
            }`}>
              <input type="checkbox" checked={entry.selected} onChange={() => onToggle(i)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{entry.ed.institution_name}</p>
                {(entry.ed.degree_type || entry.ed.field_of_study) && (
                  <p className="text-sm text-slate-500 truncate">
                    {[entry.ed.degree_type, entry.ed.field_of_study].filter(Boolean).join(' · ')}
                  </p>
                )}
                {entry.ed.graduation_year && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {entry.ed.is_graduated ? 'Graduated' : 'Expected'} {entry.ed.graduation_year}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onCancel} disabled={saving}
            className="flex-1 border border-slate-200 text-slate-600 font-semibold rounded-xl py-2.5 text-sm hover:bg-slate-50 transition disabled:opacity-40">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={selectedCount === 0 || saving}
            className="flex-1 bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition">
            {saving ? 'Adding…' : `Add ${selectedCount || ''} ${selectedCount === 1 ? 'college' : 'colleges'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Career insights sub-components (read-only) ────────────────────────────────

function UpgradeAreaCard({ area, index }: { area: CareerUpgradeArea; index: number }) {
  const [open, setOpen] = useState(index === 0)
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-white hover:bg-slate-50 transition-colors text-left">
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          <span className="font-semibold text-slate-800 text-sm">{area.area}</span>
        </div>
        <span className="text-slate-400 text-xs ml-2 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 bg-slate-50 border-t border-slate-100 space-y-2.5">
          <p className="text-xs text-slate-500 italic leading-relaxed">{area.why}</p>
          <ul className="space-y-1.5">
            {area.sub_skills.map((skill, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {skill}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function CareerInsightsDisplay({ profile }: { profile: CareerProfile }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-5 flex items-center gap-5">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-1">Current level</p>
          <p className="font-bold text-lg leading-tight truncate">{profile.detected_level_label}</p>
          {profile.detected_role && (
            <p className="text-sm text-indigo-200 mt-0.5 truncate">{profile.detected_role}</p>
          )}
        </div>
        <div className="text-xl font-bold text-white/40 shrink-0">→</div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-1">Next level</p>
          <p className="font-bold text-lg leading-tight truncate">{profile.next_level_label}</p>
          <p className="text-sm text-indigo-200 mt-0.5">Your target</p>
        </div>
      </div>

      {profile.summary && (
        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl border border-slate-100 p-4">
          {profile.summary}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white rounded-xl border border-emerald-100 p-4">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3">Strengths</p>
          <ul className="space-y-2">
            {profile.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-red-100 p-4">
          <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-3">Gaps to address</p>
          <ul className="space-y-2">
            {profile.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-slate-800 mb-3">
          Skills to reach {profile.next_level_label}
        </p>
        <div className="space-y-2">
          {profile.upgrade_path.map((area, i) => (
            <UpgradeAreaCard key={i} area={area} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Profile() {
  const { user: authUser } = useAuth()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const resumeInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Hero edit
  const [heroEditing, setHeroEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editHeadline, setEditHeadline] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [heroSaving, setHeroSaving] = useState(false)
  const [heroError, setHeroError] = useState<string | null>(null)

  // Avatar
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Work experience
  const [weEditing, setWeEditing] = useState<number | 'new' | null>(null)
  const [weForm, setWeForm] = useState<WEForm>(blankWEForm)
  const [weSaving, setWeSaving] = useState(false)
  const [weError, setWeError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importEntries, setImportEntries] = useState<ImportEntry[] | null>(null)
  const [importSaving, setImportSaving] = useState(false)

  // Education edit — eduEditing holds the record id being edited, 'new', or null
  const [eduEditing, setEduEditing] = useState<number | 'new' | null>(null)
  const [editInstitution, setEditInstitution] = useState('')
  const [editDegree, setEditDegree] = useState('')
  const [editField, setEditField] = useState('')
  const [editGradYear, setEditGradYear] = useState('')
  const [editIsGraduated, setEditIsGraduated] = useState(false)
  const [editIsPrimary, setEditIsPrimary] = useState(false)
  const [eduSaving, setEduSaving] = useState(false)
  const [eduError, setEduError] = useState<string | null>(null)
  const [eduImporting, setEduImporting] = useState(false)
  const [eduImportEntries, setEduImportEntries] = useState<EduImportEntry[] | null>(null)
  const [eduImportSaving, setEduImportSaving] = useState(false)

  // Resume
  const [uploadingResume, setUploadingResume] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [vaultActionId, setVaultActionId] = useState<number | null>(null)

  // Career analysis
  const [analysing, setAnalysing] = useState(false)
  const [analyseMsg, setAnalyseMsg] = useState<string | null>(null)
  const [insightsOpen, setInsightsOpen] = useState(false)

  useEffect(() => {
    api.get<UserProfile>('/profile/me')
      .then(r => {
        setProfile(r.data)
        setEditName(r.data.full_name)
        setEditHeadline(r.data.headline ?? '')
        setEditPhone(r.data.phone ?? '')
        setEditCompany(r.data.company ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ── Hero handlers ──────────────────────────────────────────────────────────

  const handleHeroSave = async () => {
    setHeroSaving(true)
    setHeroError(null)
    try {
      const r = await api.patch<UserProfile>('/profile/me', {
        full_name: editName.trim() || undefined,
        phone: editPhone.trim() || null,
        headline: editHeadline.trim() || null,
      })
      if (profile?.is_recruiter && editCompany.trim() !== (profile.company ?? '')) {
        await api.patch('/profile/recruiter', { company: editCompany.trim() || null })
        const r2 = await api.get<UserProfile>('/profile/me')
        setProfile(r2.data)
      } else {
        setProfile(r.data)
      }
      setHeroEditing(false)
    } catch {
      setHeroError('Failed to save. Please try again.')
    } finally {
      setHeroSaving(false)
    }
  }

  const handleAvatarChange = async (file: File | null) => {
    if (!file) return
    setAvatarUploading(true)
    const fd = new FormData()
    fd.append('avatar_file', file)
    try {
      const r = await api.post<UserProfile>('/profile/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setProfile(r.data)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (detail?.includes('not configured')) {
        alert('Photo storage is not set up in this environment. Contact your admin.')
      }
    } finally {
      setAvatarUploading(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  // ── Work experience handlers ───────────────────────────────────────────────

  const startAddWE = () => {
    setWeForm(blankWEForm)
    setWeError(null)
    setWeEditing('new')
  }

  const startEditWE = (we: WorkExperience) => {
    setWeForm(weToForm(we))
    setWeError(null)
    setWeEditing(we.id)
  }

  const handleWESave = async () => {
    setWeSaving(true)
    setWeError(null)
    try {
      const payload = formToPayload(weForm)
      let r: { data: UserProfile }
      if (weEditing === 'new') {
        r = await api.post<UserProfile>('/profile/work-experience', payload)
      } else {
        r = await api.patch<UserProfile>(`/profile/work-experience/${weEditing}`, payload)
      }
      setProfile(r.data)
      setWeEditing(null)
    } catch {
      setWeError('Failed to save. Please try again.')
    } finally {
      setWeSaving(false)
    }
  }

  const handleWEDelete = async (id: number) => {
    if (!confirm('Remove this position from your profile?')) return
    try {
      const r = await api.delete<UserProfile>(`/profile/work-experience/${id}`)
      setProfile(r.data)
    } catch {}
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      const r = await api.post<{ entries: Partial<WorkExperience>[] }>('/profile/work-experience/import')
      setImportEntries(r.data.entries.map(we => ({ we, selected: true })))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(detail || 'Import failed. Try again.')
    } finally {
      setImporting(false)
    }
  }

  const handleImportConfirm = async () => {
    if (!importEntries) return
    setImportSaving(true)
    try {
      let latest: UserProfile | null = null
      for (const entry of importEntries.filter(e => e.selected)) {
        const we = entry.we
        if (!we.company || !we.title || !we.start_year) continue
        const r = await api.post<UserProfile>('/profile/work-experience', {
          company: we.company,
          title: we.title,
          location: we.location ?? null,
          start_month: we.start_month ?? null,
          start_year: we.start_year,
          end_month: we.end_month ?? null,
          end_year: we.end_year ?? null,
          is_current: we.is_current ?? false,
          description: we.description ?? null,
        })
        latest = r.data
      }
      if (latest) setProfile(latest)
      setImportEntries(null)
    } catch {
      alert('Some entries failed to import. Please try again.')
    } finally {
      setImportSaving(false)
    }
  }

  // ── Education handlers (multi-college) ─────────────────────────────────────

  const startEditEdu = (ed?: EducationRecord) => {
    setEditInstitution(ed?.institution_name ?? '')
    setEditDegree(ed?.degree_type ?? '')
    setEditField(ed?.field_of_study ?? '')
    setEditGradYear(ed?.graduation_year ? String(ed.graduation_year) : '')
    setEditIsGraduated(ed?.is_graduated ?? false)
    setEditIsPrimary(ed?.is_primary ?? false)
    setEduError(null)
    setEduEditing(ed ? ed.id : 'new')
  }

  const handleEduSave = async () => {
    if (!editInstitution.trim()) { setEduError('Institution name is required.'); return }
    setEduSaving(true)
    setEduError(null)
    try {
      const payload = {
        institution_name: editInstitution.trim(),
        degree_type: editDegree.trim() || null,
        field_of_study: editField.trim() || null,
        graduation_year: editGradYear ? parseInt(editGradYear) : null,
        is_graduated: editIsGraduated,
        is_primary: editIsPrimary,
      }
      const r = eduEditing === 'new'
        ? await api.post<UserProfile>('/profile/education', payload)
        : await api.patch<UserProfile>(`/profile/education/${eduEditing}`, payload)
      setProfile(r.data)
      setEduEditing(null)
    } catch {
      setEduError('Failed to save education. Please try again.')
    } finally {
      setEduSaving(false)
    }
  }

  const handleEduDelete = async (id: number) => {
    if (!confirm('Remove this education record?')) return
    try {
      const r = await api.delete<UserProfile>(`/profile/education/${id}`)
      setProfile(r.data)
    } catch {}
  }

  const handleEduImport = async () => {
    setEduImporting(true)
    try {
      const r = await api.post<{ entries: Partial<EducationRecord>[] }>('/profile/education/import')
      setEduImportEntries(r.data.entries.map(ed => ({ ed, selected: true })))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(detail || 'Import failed. Try again.')
    } finally {
      setEduImporting(false)
    }
  }

  const handleEduImportConfirm = async () => {
    if (!eduImportEntries) return
    setEduImportSaving(true)
    try {
      let latest: UserProfile | null = null
      for (const entry of eduImportEntries.filter(e => e.selected)) {
        const ed = entry.ed
        if (!ed.institution_name) continue
        const r = await api.post<UserProfile>('/profile/education', {
          institution_name: ed.institution_name,
          degree_type: ed.degree_type ?? null,
          field_of_study: ed.field_of_study ?? null,
          graduation_year: ed.graduation_year ?? null,
          is_graduated: ed.is_graduated ?? null,
          is_primary: false,
        })
        latest = r.data
      }
      if (latest) setProfile(latest)
      setEduImportEntries(null)
    } catch {
      alert('Some education entries failed to import. Please try again.')
    } finally {
      setEduImportSaving(false)
    }
  }

  // ── Resume handlers ────────────────────────────────────────────────────────

  const handleResumeFile = async (file: File | null) => {
    if (!file) return
    setUploadingResume(true)
    setResumeError(null)
    const fd = new FormData()
    fd.append('resume_file', file)
    try {
      const r = await api.post<UserProfile>('/profile/resume', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setProfile(r.data)
    } catch {
      setResumeError('Could not parse this file. Please upload a PDF, DOCX, or TXT.')
    } finally {
      setUploadingResume(false)
      if (resumeInputRef.current) resumeInputRef.current.value = ''
    }
  }

  const handleAnalyse = async () => {
    setAnalysing(true)
    setAnalyseMsg(null)
    try {
      await api.post('/profile/refresh-career')
      setAnalyseMsg('Analysing your resume — results in ~15 seconds…')
      setTimeout(async () => {
        try { const r = await api.get<UserProfile>('/profile/me'); setProfile(r.data) } catch {}
        setAnalysing(false)
        setAnalyseMsg(null)
      }, 15000)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAnalyseMsg(typeof detail === 'string' ? detail : 'Analysis failed. Try again.')
      setAnalysing(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-slate-500">
        Could not load your profile.
      </div>
    )
  }

  const hasResume = !!profile.resume_filename
  const isAnalysed = !!profile.career_profile
  const primaryEd = profile.education_records?.find(e => e.is_primary) ?? profile.education_records?.[0]
  const career = profile.career_profile
  const yoe = profile.is_candidate ? totalYearsOfExperience(profile.work_experiences) : 0
  const yoeLabel = yoe >= 1 ? `${yoe % 1 === 0 ? yoe : yoe.toFixed(1)} yr${yoe >= 2 ? 's' : ''} exp` : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

      {/* Hidden inputs */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => handleAvatarChange(e.target.files?.[0] ?? null)} />
      <input ref={resumeInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden"
        onChange={e => handleResumeFile(e.target.files?.[0] ?? null)} />

      {/* Import modal */}
      {importEntries && (
        <ImportModal
          entries={importEntries}
          onToggle={i => setImportEntries(prev =>
            prev ? prev.map((e, idx) => idx === i ? { ...e, selected: !e.selected } : e) : null
          )}
          onConfirm={handleImportConfirm}
          onCancel={() => setImportEntries(null)}
          saving={importSaving}
        />
      )}

      {/* Education import modal */}
      {eduImportEntries && (
        <EduImportModal
          entries={eduImportEntries}
          onToggle={i => setEduImportEntries(prev =>
            prev ? prev.map((e, idx) => idx === i ? { ...e, selected: !e.selected } : e) : null
          )}
          onConfirm={handleEduImportConfirm}
          onCancel={() => setEduImportEntries(null)}
          saving={eduImportSaving}
        />
      )}

      {/* ── 1. Hero card ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Cover */}
        <div className="h-28 bg-gradient-to-br from-brand-blue via-indigo-500 to-purple-600" />

        {/* Identity row */}
        <div className="px-6 pb-6">
          <div className="-mt-10 mb-5 flex items-end justify-between">
            {/* Avatar */}
            <div className="relative group">
              <div className="w-20 h-20 rounded-full bg-white border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-extrabold text-brand-blue">{initials(profile.full_name)}</span>
                )}
              </div>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                title="Change photo"
                className="absolute inset-0 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center disabled:cursor-wait"
              >
                {avatarUploading ? (
                  <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                ) : (
                  <CameraIcon />
                )}
              </button>
            </div>

            {/* Edit / done */}
            {!heroEditing ? (
              <button
                onClick={() => { setHeroEditing(true); setHeroError(null) }}
                className="text-sm font-semibold text-slate-500 hover:text-brand-blue border border-slate-200 hover:border-brand-blue rounded-xl px-4 py-1.5 transition-colors"
              >
                Edit profile
              </button>
            ) : null}
          </div>

          {!heroEditing ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-extrabold text-slate-900">{profile.full_name}</h1>
                  {profile.linkedin_verified && (
                    <span title="LinkedIn verified"
                      className="text-[#0A66C2] text-xs font-bold border border-[#0A66C2]/30 rounded px-1.5 py-0.5 shrink-0">
                      in
                    </span>
                  )}
                </div>
                {(profile.headline || career?.detected_role) && (
                  <p className="text-slate-500 text-sm mt-0.5">{profile.headline || career?.detected_role}</p>
                )}
                <div className="flex gap-2 mt-2 flex-wrap">
                  {profile.is_candidate && (
                    <span className="text-xs font-semibold bg-blue-50 text-brand-blue border border-blue-100 rounded-full px-2.5 py-1">
                      Candidate
                    </span>
                  )}
                  {profile.is_recruiter && (
                    <span className="text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2.5 py-1">
                      Recruiter
                    </span>
                  )}
                  {career?.detected_level_label && (
                    <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2.5 py-1">
                      {career.detected_level_label}
                    </span>
                  )}
                  {yoeLabel && (
                    <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-1">
                      {yoeLabel}
                    </span>
                  )}
                  {primaryEd?.institution_name && (
                    <span className="text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200 rounded-full px-2.5 py-1">
                      🎓 {primaryEd.institution_name}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <MailIcon />
                  <span className="truncate">{profile.email}</span>
                </div>
                {profile.phone && (
                  <div className="flex items-center gap-2">
                    <PhoneIcon />
                    <span>{profile.phone}</span>
                  </div>
                )}
                {profile.is_recruiter && profile.company && (
                  <div className="flex items-center gap-2">
                    <BuildingIcon />
                    <span>{profile.company}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <CalendarIcon />
                  <span>Joined {profile.created_at
                    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    : '—'}
                  </span>
                </div>
              </div>

              {career?.summary && (
                <p className="text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                  {career.summary}
                </p>
              )}
            </div>
          ) : (
            /* Hero edit form */
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full Name">
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className={INP} />
                </Field>
                <Field label="Phone">
                  <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                    placeholder="+1 555 000 0000" className={INP} />
                </Field>
              </div>
              <Field label="Headline">
                <input value={editHeadline} onChange={e => setEditHeadline(e.target.value)}
                  placeholder="Software Engineer · Open to opportunities" maxLength={120}
                  className={INP} />
              </Field>
              {profile.is_recruiter && (
                <Field label="Company">
                  <input value={editCompany} onChange={e => setEditCompany(e.target.value)}
                    placeholder="Company name" className={INP} />
                </Field>
              )}
              <p className="text-xs text-slate-400">Email cannot be changed after registration.</p>
              {heroError && <p className="text-sm text-red-500">{heroError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setHeroEditing(false)
                    setEditName(profile.full_name)
                    setEditHeadline(profile.headline ?? '')
                    setEditPhone(profile.phone ?? '')
                    setEditCompany(profile.company ?? '')
                  }}
                  disabled={heroSaving}
                  className="flex-1 border border-slate-200 text-slate-600 font-semibold rounded-xl py-2.5 text-sm hover:bg-slate-50 transition disabled:opacity-40"
                >
                  Cancel
                </button>
                <button onClick={handleHeroSave} disabled={heroSaving || !editName.trim()}
                  className="flex-1 bg-brand-blue hover:bg-blue-600 text-white font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-50">
                  {heroSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Work Experience ─────────────────────────────────────────────── */}
      <SectionCard
        title="Work Experience"
        action={
          weEditing === null ? (
            <>
              <button
                onClick={handleImport}
                disabled={importing || !profile.is_candidate || !profile.resume_filename}
                title={!profile.resume_filename ? 'Upload a resume first' : undefined}
                className="text-xs font-semibold text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing…' : 'Import from resume'}
              </button>
              <button onClick={startAddWE}
                className="text-xs font-semibold text-white bg-brand-blue hover:bg-blue-600 rounded-lg px-3 py-1.5 transition-colors">
                + Add
              </button>
            </>
          ) : null
        }
      >
        {weEditing === 'new' && (
          <div className="mb-4">
            <WEFormPanel form={weForm} onChange={setWeForm} onSave={handleWESave}
              onCancel={() => setWeEditing(null)} saving={weSaving} error={weError} isEdit={false} />
          </div>
        )}

        {profile.work_experiences.length === 0 && weEditing !== 'new' ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <BriefcaseIcon />
            </div>
            <p className="text-sm font-medium text-slate-700">No work experience yet</p>
            <p className="text-xs text-slate-400 mt-0.5">Add positions manually or import from your resume.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {profile.work_experiences.map((we, i) => (
              weEditing === we.id ? (
                <WEFormPanel key={we.id} form={weForm} onChange={setWeForm} onSave={handleWESave}
                  onCancel={() => setWeEditing(null)} saving={weSaving} error={weError} isEdit={true} />
              ) : (
                <div key={we.id}>
                  {i > 0 && <div className="border-t border-slate-100 mb-4" />}
                  <div className="flex items-start gap-3 group">
                    {/* Company badge */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${companyBadge(we.company)}`}>
                      {we.company[0].toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm leading-tight">{we.title}</p>
                      <p className="text-sm text-slate-500 mt-0.5">{we.company}{we.location ? ` · ${we.location}` : ''}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDateRange(we)} · {calcDuration(we)}
                      </p>
                      {we.description && <WEDescription text={we.description} />}
                    </div>

                    {/* Actions (show on hover) */}
                    <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditWE(we)}
                        className="text-xs font-semibold text-slate-400 hover:text-brand-blue border border-slate-200 hover:border-brand-blue rounded-lg px-2.5 py-1 transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleWEDelete(we.id)}
                        className="text-xs font-semibold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 rounded-lg px-2.5 py-1 transition-colors">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── 3. Education (candidates only — supports multiple colleges) ────── */}
      {profile.is_candidate && (
        <SectionCard
          title="Education"
          action={
            eduEditing === null ? (
              <>
                <button
                  onClick={handleEduImport}
                  disabled={eduImporting || !profile.resume_filename}
                  title={!profile.resume_filename ? 'Upload a resume first' : undefined}
                  className="text-xs font-semibold text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {eduImporting ? 'Importing…' : 'Import from resume'}
                </button>
                <button onClick={() => startEditEdu()}
                  className="text-xs font-semibold text-white bg-brand-blue hover:bg-blue-600 rounded-lg px-3 py-1.5 transition-colors">
                  + Add
                </button>
              </>
            ) : null
          }
        >
          {eduEditing === 'new' && (
            <div className="mb-4">
              <EduFormPanel
                institution={editInstitution} degree={editDegree} field={editField}
                gradYear={editGradYear} isGraduated={editIsGraduated} isPrimary={editIsPrimary}
                showPrimaryToggle={(profile.education_records?.length ?? 0) > 0}
                setInstitution={setEditInstitution} setDegree={setEditDegree} setField={setEditField}
                setGradYear={setEditGradYear} setIsGraduated={setEditIsGraduated} setIsPrimary={setEditIsPrimary}
                onSave={handleEduSave} onCancel={() => setEduEditing(null)}
                saving={eduSaving} error={eduError} isEdit={false}
              />
            </div>
          )}

          {(profile.education_records?.length ?? 0) === 0 && eduEditing !== 'new' ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <GraduationIcon className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No education added yet</p>
              <p className="text-xs text-slate-400 mt-0.5">Add your colleges — bachelors, masters, and more.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {profile.education_records.map((ed, i) => (
                eduEditing === ed.id ? (
                  <EduFormPanel key={ed.id}
                    institution={editInstitution} degree={editDegree} field={editField}
                    gradYear={editGradYear} isGraduated={editIsGraduated} isPrimary={editIsPrimary}
                    showPrimaryToggle={!ed.is_primary}
                    setInstitution={setEditInstitution} setDegree={setEditDegree} setField={setEditField}
                    setGradYear={setEditGradYear} setIsGraduated={setEditIsGraduated} setIsPrimary={setEditIsPrimary}
                    onSave={handleEduSave} onCancel={() => setEduEditing(null)}
                    saving={eduSaving} error={eduError} isEdit={true}
                  />
                ) : (
                  <div key={ed.id}>
                    {i > 0 && <div className="border-t border-slate-100 mb-4" />}
                    <div className="flex items-start gap-3 group">
                      {ed.is_primary && profile.college_logo_url ? (
                        <img src={profile.college_logo_url} alt={ed.institution_name}
                          className="w-10 h-10 rounded-xl object-contain bg-slate-50 border border-slate-100 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          <GraduationIcon />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900 text-sm">{ed.institution_name}</p>
                          {ed.is_primary && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-brand-blue border border-blue-100 rounded px-1.5 py-0.5">
                              Primary
                            </span>
                          )}
                        </div>
                        {(ed.degree_type || ed.field_of_study) && (
                          <p className="text-sm text-slate-500 mt-0.5">
                            {[ed.degree_type, ed.field_of_study].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">
                          {ed.graduation_year
                            ? `${ed.is_graduated ? 'Graduated' : 'Expected'} ${ed.graduation_year}`
                            : ed.is_graduated ? 'Graduated' : 'Current student'}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEditEdu(ed)}
                          className="text-xs font-semibold text-slate-400 hover:text-brand-blue border border-slate-200 hover:border-brand-blue rounded-lg px-2.5 py-1 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => handleEduDelete(ed.id)}
                          className="text-xs font-semibold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 rounded-lg px-2.5 py-1 transition-colors">
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── 4. Resume (candidates only) ───────────────────────────────────── */}
      {profile.is_candidate && (
        <SectionCard
          title="Resume"
          action={
            hasResume ? (
              <button onClick={() => resumeInputRef.current?.click()} disabled={uploadingResume}
                className="text-xs font-semibold text-slate-500 hover:text-brand-blue border border-slate-200 hover:border-brand-blue rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40">
                {uploadingResume ? 'Uploading…' : 'Replace'}
              </button>
            ) : null
          }
        >
          {!hasResume ? (
            <button onClick={() => resumeInputRef.current?.click()} disabled={uploadingResume}
              className="w-full rounded-xl border-2 border-dashed border-slate-200 hover:border-brand-blue hover:bg-blue-50/30 transition-colors p-8 text-center group">
              {uploadingResume ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-brand-blue rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-slate-500">Uploading…</p>
                </div>
              ) : (
                <>
                  <p className="text-3xl mb-2 group-hover:scale-110 transition-transform">📄</p>
                  <p className="font-semibold text-slate-700 group-hover:text-brand-blue text-sm transition-colors">
                    Upload your resume
                  </p>
                  <p className="text-xs text-slate-400 mt-1">PDF, DOCX, or TXT · Click to browse</p>
                  <p className="text-xs text-indigo-500 mt-1.5 font-medium">Enables Career Insights and Magic Match</p>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
              {/* Active resume */}
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
                <span className="text-xl shrink-0">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{profile.resume_filename}</p>
                  {isAnalysed && profile.career_profile_updated_at ? (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Analysed {new Date(profile.career_profile_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">Not yet analysed</p>
                  )}
                </div>
                {isAnalysed && !analysing && (
                  <button onClick={handleAnalyse}
                    className="shrink-0 text-xs font-semibold text-slate-400 hover:text-indigo-600 transition-colors">
                    ↻ Re-analyse
                  </button>
                )}
              </div>

              {/* Analyse CTA */}
              {!isAnalysed && !analysing && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Resume ready for analysis</p>
                    <p className="text-xs text-amber-600 mt-0.5">Get your strengths, gaps, and career upgrade plan</p>
                  </div>
                  <button onClick={handleAnalyse}
                    className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg px-4 py-2 text-xs transition-colors">
                    ✨ Analyse
                  </button>
                </div>
              )}

              {analysing && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin shrink-0" />
                  <p className="text-sm text-indigo-700 font-medium">{analyseMsg ?? 'Analysing…'}</p>
                </div>
              )}

              {!analysing && analyseMsg && (
                <p className="text-xs text-red-500">{analyseMsg}</p>
              )}

              {/* Resume vault */}
              {profile.resumes.length > 1 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Vault — {profile.resumes.length}/3</p>
                  {profile.resumes.map((r: VaultResume) => (
                    <div key={r.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                      r.is_primary ? 'border-brand-blue/30 bg-blue-50/40' : 'border-slate-200'
                    }`}>
                      <span className="text-base shrink-0">📄</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-medium text-slate-800 truncate">{r.filename}</p>
                          {r.is_primary && (
                            <span className="text-[10px] font-bold bg-brand-blue text-white rounded-full px-1.5 py-0.5 shrink-0">Active</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(r.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {!r.is_primary && (
                          <button disabled={vaultActionId === r.id}
                            onClick={async () => {
                              setVaultActionId(r.id)
                              try { const res = await api.post<UserProfile>(`/profile/resumes/${r.id}/set-active`); setProfile(res.data) } catch {}
                              setVaultActionId(null)
                            }}
                            className="text-[11px] font-semibold text-brand-blue hover:text-blue-700 border border-brand-blue/30 hover:border-brand-blue rounded-md px-2 py-1 transition-colors disabled:opacity-40">
                            {vaultActionId === r.id ? '…' : 'Set active'}
                          </button>
                        )}
                        <button disabled={vaultActionId === r.id}
                          onClick={async () => {
                            if (!confirm(`Delete "${r.filename}"?`)) return
                            setVaultActionId(r.id)
                            try { const res = await api.delete<UserProfile>(`/profile/resumes/${r.id}`); setProfile(res.data) } catch {}
                            setVaultActionId(null)
                          }}
                          className="text-[11px] font-semibold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 rounded-md px-2 py-1 transition-colors disabled:opacity-40">
                          Del
                        </button>
                      </div>
                    </div>
                  ))}
                  {profile.resumes.length < 3 && (
                    <button onClick={() => resumeInputRef.current?.click()} disabled={uploadingResume}
                      className="w-full rounded-lg border border-dashed border-slate-200 hover:border-brand-blue text-xs text-slate-400 hover:text-brand-blue font-medium py-2.5 transition-colors">
                      + Add another version
                    </button>
                  )}
                </div>
              )}

              {resumeError && <p className="text-xs text-red-500">{resumeError}</p>}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── 5. Career Insights (candidates, collapsible) ───────────────────── */}
      {profile.is_candidate && isAnalysed && profile.career_profile && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setInsightsOpen(o => !o)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors text-left"
          >
            <div>
              <h2 className="font-bold text-slate-900 text-base">Career Insights</h2>
              {profile.career_profile_updated_at && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Updated {new Date(profile.career_profile_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <span className="text-slate-400 text-sm">{insightsOpen ? '▲' : '▼'}</span>
          </button>
          {insightsOpen && (
            <div className="px-6 pb-6 border-t border-slate-100">
              <div className="pt-5">
                <CareerInsightsDisplay profile={profile.career_profile} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

const INP = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition bg-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}

function BriefcaseIcon() {
  return (
    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
    </svg>
  )
}

function GraduationIcon({ className = 'w-5 h-5 text-slate-400' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
    </svg>
  )
}
