import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Org, Seat, TeamDashboard, PlaybookEntry,
  listOrgs, createOrg, listSeats, inviteSeats, offboardSeat,
  getDashboard, getPlaybook, closePeriod, getAccess,
} from '../api/pulse'
import PulseWave from '../components/PulseWave'
import '../styles/pulse.css'

/**
 * Nideknil Pulse — founder/eng-leader dashboard. Reads the team's AI-fluency
 * signal: the waveform hero, per-skill signal meters, where-to-focus gaps, the
 * peer-learning Playbook, and the roster. Design system in styles/pulse.css.
 */
export default function TeamPulseDashboard() {
  const nav = useNavigate()
  const [access, setAccess] = useState<boolean | null>(null)
  const [orgs, setOrgs] = useState<Org[] | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [dash, setDash] = useState<TeamDashboard | null>(null)
  const [playbook, setPlaybook] = useState<PlaybookEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [invite, setInvite] = useState('')
  const [invited, setInvited] = useState<{ email: string; cmd: string }[]>([])
  const [form, setForm] = useState({ name: '', cadence: 'monthly', region: 'IN' })

  useEffect(() => {
    getAccess().then(a => {
      setAccess(a.has_access)
      if (a.has_access) listOrgs().then(setOrgs).catch(() => setOrgs([]))
    }).catch(() => setAccess(false))
  }, [])

  async function loadOrg(o: Org) {
    setOrg(o); setInvited([])
    const [s, d, p] = await Promise.all([
      listSeats(o.id), getDashboard(o.id).catch(() => null), getPlaybook(o.id).catch(() => []),
    ])
    setSeats(s); setDash(d); setPlaybook(p)
  }

  async function create() {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const o = await createOrg(form)
      setOrgs([o, ...(orgs || [])]); setForm({ name: '', cadence: 'monthly', region: 'IN' })
      await loadOrg(o)
    } finally { setBusy(false) }
  }

  async function sendInvites() {
    if (!org) return
    const emails = invite.split(/[\s,]+/).map(e => e.trim()).filter(Boolean)
    if (!emails.length) return
    setBusy(true)
    try {
      const res = await inviteSeats(org.id, emails)
      setInvited(res.map(r => ({ email: r.seat.email, cmd: r.connect_command })))
      setInvite(''); setSeats(await listSeats(org.id))
    } catch (e: any) { alert(e?.response?.data?.detail || 'Invite failed') }
    finally { setBusy(false) }
  }

  async function freeze() {
    if (!org) return
    setBusy(true)
    try { setDash(await closePeriod(org.id)); setPlaybook(await getPlaybook(org.id)) }
    finally { setBusy(false) }
  }

  async function remove(seat: Seat) {
    if (!org || !confirm(`Remove ${seat.email}? Reports are kept; their access is revoked.`)) return
    await offboardSeat(org.id, seat.id); setSeats(await listSeats(org.id))
  }

  if (access === null) return <div className="pulse-root"><div className="pulse-wrap mono">Loading signal…</div></div>

  // Early-access gate — Pulse is pre-launch; org creation is 403 without access.
  if (!access) {
    return (
      <div className="pulse-root">
        <div className="pulse-wrap pulse-stack">
          <div className="rise">
            <div className="eyebrow">nideknil <span className="dot">▸</span> pulse · early access</div>
            <h1 className="display-xl" style={{ marginTop: 10 }}>Pulse isn't open<br />for your account yet.</h1>
            <p className="lede" style={{ marginTop: 12 }}>
              We're rolling out the AI Fluency Team Report to a small cohort of teams. Join the list and
              we'll enable your account shortly.
            </p>
            <button className="p-btn signal" style={{ marginTop: 16 }} onClick={() => nav('/pulse')}>Request early access →</button>
          </div>
        </div>
      </div>
    )
  }

  if (orgs === null) return <div className="pulse-root"><div className="pulse-wrap mono">Loading signal…</div></div>

  // ── Org picker + create ──
  if (!org) {
    return (
      <div className="pulse-root">
        <div className="pulse-wrap pulse-stack">
          <div className="rise">
            <div className="eyebrow">nideknil <span className="dot">▸</span> pulse</div>
            <h1 className="display-xl" style={{ marginTop: 10 }}>Your team already uses AI.<br />Now read the signal.</h1>
            <p className="lede" style={{ marginTop: 12 }}>
              Pulse scores how well your engineers actually collaborate with AI — from real Claude Code
              sessions — and turns your strongest patterns into a playbook the whole team can copy.
            </p>
          </div>

          <div className="p-panel ticked rise" style={{ animationDelay: '.06s' }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>new team</div>
            <input className="p-input" placeholder="Team or company name" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && create()} />
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '14px 0' }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>cadence</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['monthly', 'weekly'].map(c => (
                    <button key={c} className="chip" data-on={form.cadence === c} onClick={() => setForm({ ...form, cadence: c })}>{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>pricing region</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['IN', 'US'].map(r => (
                    <button key={r} className="chip" data-on={form.region === r} onClick={() => setForm({ ...form, region: r })}>{r === 'IN' ? '🇮🇳 India' : '🇺🇸 US'}</button>
                  ))}
                </div>
              </div>
            </div>
            <button className="p-btn signal" onClick={create} disabled={busy || !form.name.trim()}>
              {busy ? 'Creating…' : 'Create team →'}
            </button>
          </div>

          {(orgs.length > 0) && <div className="eyebrow" style={{ marginTop: 8 }}>your teams</div>}
          {orgs.map(o => (
            <div key={o.id} className="p-panel card-lift" onClick={() => loadOrg(o)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 19 }}>{o.name}</h3>
                <span className="p-tag">{o.plan} · {o.region} · {o.cadence}</span>
              </div>
              <div className="mono" style={{ color: 'var(--p-muted)', fontSize: 12.5, marginTop: 6 }}>
                {o.active_seats}/{o.seats_limit} seats connected
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Dashboard ──
  const idx = dash?.team_index ?? null
  const trendVals = (dash?.trend || []).map(t => (t.team_index ?? 0))
  const meters = [...(dash?.gap_heatmap || [])].sort((a, b) => b.avg - a.avg)
  const gaps = (dash?.gap_heatmap || []).slice(0, 3)

  return (
    <div className="pulse-root">
      <div className="pulse-wrap pulse-stack">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="p-link" onClick={() => setOrg(null)}>← all teams</button>
          <span className="p-tag">period {dash?.period_label}</span>
        </div>

        {/* HERO — the signal */}
        <div className="p-panel ticked hero-grid rise">
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="eyebrow"><span className="dot">◉</span> team fluency signal</div>
              <h2 style={{ fontSize: 22, marginTop: 8 }}>{org.name}</h2>
            </div>
            <div>
              <div className="readout">
                <span className="num">{idx == null ? '—' : idx}</span>
                <span className="den">/100</span>
              </div>
              <div className="stat-row">
                <div className="stat"><div className="k">adoption</div><div className="v">{dash ? Math.round(dash.adoption * 100) : 0}%</div></div>
                <div className="stat"><div className="k">reporting</div><div className="v">{dash?.seats_reporting}/{dash?.seats_active}</div></div>
                <div className="stat"><div className="k">trend</div><div className="v up">{trendVals.length > 1 ? '▲ live' : 'baseline'}</div></div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <PulseWave values={trendVals} height={168} id="hero" />
          </div>
        </div>

        {/* SKILL SIGNAL */}
        <div className="p-panel">
          <div className="eyebrow" style={{ marginBottom: 12 }}>skill signal · by dimension</div>
          {meters.length === 0 && <div className="mono" style={{ color: 'var(--p-muted)' }}>No sessions scored yet this period.</div>}
          {meters.map((m, i) => (
            <div className="meter-row" key={m.key}>
              <span className="label">{m.label}</span>
              <span className="meter"><span style={{ width: `${m.avg}%`, animationDelay: `${i * 0.05}s` }} /></span>
              <span className="score">{m.avg}</span>
            </div>
          ))}
        </div>

        {/* WHERE TO FOCUS + PLAYBOOK */}
        <div className="pulse-two">
          <div className="p-panel">
            <div className="eyebrow" style={{ marginBottom: 4 }}>where to focus</div>
            <p className="lede" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>Weakest dimensions — point enablement here.</p>
            {gaps.length === 0 && <div className="mono" style={{ color: 'var(--p-muted)' }}>—</div>}
            {gaps.map(g => (
              <div className="gap" key={g.key}>
                <span className="rank mono">{String(g.rank).padStart(2, '0')}</span>
                <span className="g-label">{g.label}</span>
                <span className="g-val">{g.avg}</span>
              </div>
            ))}
          </div>
          <div className="p-panel">
            <div className="eyebrow" style={{ marginBottom: 4 }}>📘 playbook</div>
            <p className="lede" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>Techniques worth stealing, from your strongest signals.</p>
            {playbook.length === 0 && <div className="mono" style={{ color: 'var(--p-muted)', fontSize: 12.5 }}>Freeze a period to mine the playbook.</div>}
            {playbook.map(p => (
              <div className="play" key={p.id}>
                <div className="tech">{p.technique}</div>
                {p.evidence && <div className="ev">“{p.evidence}”</div>}
                <div className="src">{p.attributed_name ? p.attributed_name : 'anonymized'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* LEADERBOARD */}
        {(dash?.leaderboard || []).length > 0 && (
          <div className="p-panel">
            <div className="eyebrow" style={{ marginBottom: 10 }}>leaderboard · opt-in names only</div>
            {dash!.leaderboard.map((l, i) => (
              <div className="row" key={i}>
                <span><span className="mono" style={{ color: 'var(--p-muted)' }}>{String(i + 1).padStart(2, '0')}</span>&nbsp;&nbsp;{l.name}</span>
                <span className="mono" style={{ color: l.attributed ? 'var(--p-mint)' : 'var(--p-text)' }}>{l.overall_score}</span>
              </div>
            ))}
          </div>
        )}

        {/* ROSTER */}
        <div className="p-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="eyebrow">engineers · {org.active_seats}/{org.seats_limit} seats</div>
            <button className="p-btn signal" onClick={freeze} disabled={busy}>Freeze period →</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input className="p-input" value={invite} onChange={e => setInvite(e.target.value)}
              placeholder="engineer emails — comma or space separated" onKeyDown={e => e.key === 'Enter' && sendInvites()} />
            <button className="p-btn primary" onClick={sendInvites} disabled={busy}>Invite</button>
          </div>
          {invited.length > 0 && (
            <div className="p-panel" style={{ background: 'var(--p-panel-2)', marginBottom: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>invites sent · setup command (also emailed)</div>
              {invited.map(iv => (
                <div key={iv.email} style={{ marginBottom: 8 }}>
                  <div className="mono" style={{ fontSize: 12, marginBottom: 3 }}>{iv.email}</div>
                  <code className="p-code">{iv.cmd}</code>
                </div>
              ))}
            </div>
          )}
          {seats.map(s => (
            <div className="row" key={s.id}>
              <span>{s.full_name || s.email}</span>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="p-tag">{s.status}{s.connected_at ? ' · connected' : ''}</span>
                <button className="p-link" style={{ color: 'var(--p-signal)' }} onClick={() => remove(s)}>remove</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
