import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAccess, requestEarlyAccess } from '../api/pulse'
import PulseWave from '../components/PulseWave'
import '../styles/pulse.css'

/**
 * Public "coming soon" landing + early-access waitlist for Nideknil Pulse.
 * If a signed-in user already has access, it becomes the door into the product.
 */
export default function PulseLanding() {
  const nav = useNavigate()
  const [hasAccess, setHasAccess] = useState(false)
  const [form, setForm] = useState({ email: '', company: '', team_size: '', note: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  // Only probe access when signed in — /pulse is a public page, and calling an
  // authed endpoint while logged out would trip the global 401→login redirect.
  useEffect(() => {
    if (localStorage.getItem('auth_token')) {
      getAccess().then(a => setHasAccess(a.has_access)).catch(() => {})
    }
  }, [])

  async function submit() {
    if (!form.email.trim()) return
    setState('sending')
    try { await requestEarlyAccess(form); setState('done') }
    catch { setState('error') }
  }

  const dims = [
    ['Planning & Decomposition', 78], ['Context Engineering', 84],
    ['Verification & Validation', 66], ['Debugging & RCA', 71],
  ] as const

  return (
    <div className="pulse-root">
      <div className="pulse-wrap pulse-stack">
        {/* HERO */}
        <div className="rise" style={{ paddingTop: 8 }}>
          <div className="eyebrow">nideknil <span className="dot">▸</span> pulse · coming soon</div>
          <h1 className="display-xl" style={{ marginTop: 12, fontSize: 'clamp(34px,6vw,60px)' }}>
            Your team uses AI.<br />Now measure how <span style={{ color: 'var(--p-signal)' }}>well.</span>
          </h1>
          <p className="lede" style={{ marginTop: 14, fontSize: 16 }}>
            Pulse reads your team's real Claude Code sessions and scores how well each engineer
            collaborates with AI — then turns your strongest patterns into a playbook the whole team
            copies. Opt-in, secrets-scrubbed, coaching — not surveillance.
          </p>
          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {hasAccess
              ? <button className="p-btn signal" onClick={() => nav('/pulse/dashboard')}>Open Pulse →</button>
              : <a href="#waitlist" className="p-btn signal">Request early access →</a>}
            <span className="p-tag" style={{ alignSelf: 'center' }}>for founders &amp; eng leaders</span>
          </div>
        </div>

        {/* SIGNAL PREVIEW */}
        <div className="p-panel ticked rise" style={{ animationDelay: '.06s' }}>
          <div className="hero-grid" style={{ alignItems: 'center' }}>
            <div>
              <div className="eyebrow"><span className="dot">◉</span> team fluency signal</div>
              <div className="readout" style={{ marginTop: 8 }}><span className="num">73</span><span className="den">/100</span></div>
              <p className="lede" style={{ fontSize: 13, marginTop: 6 }}>A single, trend-able number for how AI-fluent your team is — with the gaps and the fixes.</p>
            </div>
            <PulseWave values={[62, 65, 64, 69, 71, 73]} height={150} id="land" />
          </div>
          <div style={{ marginTop: 12 }}>
            {dims.map(([label, v], i) => (
              <div className="meter-row" key={label}>
                <span className="label">{label}</span>
                <span className="meter"><span style={{ width: `${v}%`, animationDelay: `${i * 0.06}s` }} /></span>
                <span className="score">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* WHY */}
        <div className="pulse-two">
          <div className="p-panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>for founders &amp; eng leaders</div>
            <p className="lede" style={{ fontSize: 14 }}>
              Stop guessing whether your AI bet is working. Get a board-ready number, see where the team
              is weak, and make your <em>median</em> engineer as sharp as your best one.
            </p>
          </div>
          <div className="p-panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>for engineers</div>
            <p className="lede" style={{ fontSize: 14 }}>
              A private coach for how you work with AI — your strengths, your next skill to build, and the
              team's best techniques to steal. You control what your manager sees.
            </p>
          </div>
        </div>

        {/* WAITLIST */}
        {!hasAccess && (
          <div className="p-panel ticked" id="waitlist">
            <div className="eyebrow" style={{ marginBottom: 10 }}>request early access</div>
            {state === 'done' ? (
              <div style={{ padding: '10px 0' }}>
                <h3 style={{ fontSize: 20, color: 'var(--p-mint)' }}>You're on the list ✓</h3>
                <p className="lede" style={{ fontSize: 14, marginTop: 6 }}>We'll email you the moment your team is enabled.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="pulse-two">
                  <input className="p-input" placeholder="Work email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  <input className="p-input" placeholder="Company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 10, margin: '10px 0' }}>
                  {['1-10', '11-50', '51-200', '200+'].map(s => (
                    <button key={s} className="chip" data-on={form.team_size === s} onClick={() => setForm({ ...form, team_size: s })}>{s} eng</button>
                  ))}
                </div>
                <input className="p-input" placeholder="Anything we should know? (optional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
                <button className="p-btn signal" style={{ marginTop: 12 }} onClick={submit} disabled={state === 'sending' || !form.email.trim()}>
                  {state === 'sending' ? 'Sending…' : 'Join the early-access list →'}
                </button>
                {state === 'error' && <div style={{ color: 'var(--p-signal)', fontSize: 13, marginTop: 8 }}>Something went wrong — try again.</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
