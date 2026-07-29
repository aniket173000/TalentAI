import { useEffect, useState } from 'react'
import { AccessRequestRow, listAccessRequests, grantAccess, denyAccess } from '../api/pulse'
import '../styles/pulse.css'

/** Admin-only: review & approve the Pulse early-access waitlist. */
export default function PulseAdmin() {
  const [rows, setRows] = useState<AccessRequestRow[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string>('')

  function load() {
    listAccessRequests().then(setRows)
      .catch(e => setErr(e?.response?.status === 403 ? 'Admins only.' : 'Could not load requests.'))
  }
  useEffect(load, [])

  async function act(email: string, fn: (e: string) => Promise<unknown>) {
    setBusy(email)
    try { await fn(email); load() } finally { setBusy('') }
  }

  const chip = (s: string) => {
    const color = s === 'granted' ? 'var(--p-mint)' : s === 'denied' ? 'var(--p-signal)' : 'var(--p-muted)'
    return <span className="p-tag" style={{ color, borderColor: color }}>{s}</span>
  }

  return (
    <div className="pulse-root">
      <div className="pulse-wrap pulse-stack">
        <div>
          <div className="eyebrow">nideknil <span className="dot">▸</span> pulse · admin</div>
          <h1 className="display-xl" style={{ marginTop: 10 }}>Early-access waitlist</h1>
          <p className="lede" style={{ marginTop: 10 }}>Approve teams into Pulse. Granting enables org creation for that email.</p>
        </div>

        {err && <div className="p-panel">{err}</div>}
        {!err && rows === null && <div className="mono">Loading…</div>}
        {!err && rows?.length === 0 && <div className="p-panel mono" style={{ color: 'var(--p-muted)' }}>No requests yet.</div>}

        {rows?.map(r => (
          <div className="p-panel" key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 240 }}>
                <div style={{ fontWeight: 600, fontSize: 16, fontFamily: 'var(--p-display)' }}>{r.email}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--p-muted)', marginTop: 4 }}>
                  {[r.company, r.team_size && `${r.team_size} eng`].filter(Boolean).join(' · ') || '—'}
                </div>
                {r.note && <p className="lede" style={{ fontSize: 13, marginTop: 6 }}>{r.note}</p>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {chip(r.status)}
                {r.status !== 'granted' && (
                  <button className="p-btn signal" disabled={busy === r.email} onClick={() => act(r.email, grantAccess)}>Grant</button>
                )}
                {r.status !== 'denied' && (
                  <button className="p-btn ghost" disabled={busy === r.email} onClick={() => act(r.email, denyAccess)}>Deny</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
