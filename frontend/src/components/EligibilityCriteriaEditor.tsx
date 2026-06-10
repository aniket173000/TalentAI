import { KeyboardEvent, useState } from 'react'
import { EducationLevel, EligibilityCriteria } from '../types'

const EDUCATION_LEVELS: EducationLevel[] = ['None', 'Diploma', 'Bachelor', 'Master', 'PhD']

interface Props {
  value: EligibilityCriteria
  onChange: (v: EligibilityCriteria) => void
}

function isClear(v: EligibilityCriteria) {
  return !v.min_years_experience && v.required_skills.length === 0 &&
    (!v.required_education || v.required_education === 'None')
}

export default function EligibilityCriteriaEditor({ value, onChange }: Props) {
  const [skillInput, setSkillInput] = useState('')

  const addSkill = () => {
    const skill = skillInput.trim()
    if (!skill || value.required_skills.includes(skill)) { setSkillInput(''); return }
    onChange({ ...value, required_skills: [...value.required_skills, skill] })
    setSkillInput('')
  }

  const removeSkill = (skill: string) => {
    onChange({ ...value, required_skills: value.required_skills.filter(s => s !== skill) })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill() }
  }

  const willBeEmpty = (next: EligibilityCriteria) => isClear(next)

  return (
    <div className="space-y-5">
      {isClear(value) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 flex gap-2">
          <span>⚠</span>
          <span>No eligibility criteria set — all candidates who meet the minimum score will be considered.</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Min years */}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">
            Min. Years of Experience
          </label>
          <input
            type="number"
            min={0}
            max={30}
            value={value.min_years_experience ?? ''}
            onChange={e => {
              const n = e.target.value === '' ? null : parseInt(e.target.value, 10)
              const next = { ...value, min_years_experience: isNaN(n as number) ? null : n }
              if (willBeEmpty(next)) {/* show warning via isClear */}
              onChange(next)
            }}
            placeholder="e.g. 3"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
          />
        </div>

        {/* Education level */}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">
            Min. Education Level
          </label>
          <select
            value={value.required_education ?? 'None'}
            onChange={e => onChange({ ...value, required_education: e.target.value === 'None' ? null : e.target.value as EducationLevel })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
          >
            {EDUCATION_LEVELS.map(lvl => (
              <option key={lvl} value={lvl}>{lvl === 'None' ? 'No requirement' : lvl}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Required skills tags */}
      <div>
        <label className="block text-sm font-medium text-slate-600 mb-1.5">
          Required Skills
          <span className="ml-1 text-xs font-normal text-slate-400">(hard requirements)</span>
        </label>
        {value.required_skills.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {value.required_skills.map(skill => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 bg-brand-blue/10 text-brand-blue text-xs font-semibold px-2.5 py-1 rounded-full border border-brand-blue/20"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  className="ml-0.5 text-brand-blue/50 hover:text-brand-blue font-bold leading-none"
                  aria-label={`Remove ${skill}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a skill and press Enter"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
          />
          <button
            type="button"
            onClick={addSkill}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-lg transition"
          >
            Add
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">Press Enter or comma to add a skill chip.</p>
      </div>
    </div>
  )
}
