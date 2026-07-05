import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { Button, Card, Tag } from '../components/ui'

interface McpKey {
  id: number
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

interface McpKeyIssueResponse extends McpKey {
  key: string
  connect_command: string
}

export default function RecruiterMcpSettings() {
  const [keys, setKeys] = useState<McpKey[] | null>(null)
  const [justIssued, setJustIssued] = useState<McpKeyIssueResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await api.get<McpKey[]>('/recruiter/mcp-keys')
    setKeys(res.data)
  }, [])

  useEffect(() => {
    load().catch(() => {
      // Same fix as JobAssignments.tsx: fall through to the empty state
      // instead of getting stuck on the spinner forever when the fetch fails.
      setError('Could not load keys')
      setKeys([])
    })
  }, [load])

  const generate = async () => {
    setBusy(true); setError('')
    try {
      const res = await api.post<McpKeyIssueResponse>('/recruiter/mcp-keys')
      setJustIssued(res.data)
      await load()
    } catch {
      setError('Failed to generate key')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: number) => {
    try {
      await api.delete(`/recruiter/mcp-keys/${id}`)
      await load()
    } catch {
      setError('Failed to revoke key')
    }
  }

  if (!keys) return <LoadingSpinner />

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em' }}>
          Claude Code Interview Copilot
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          Connect your own Claude Code to ask questions about a candidate's AI-fluency report and resume
          — useful right before an interview. Only submissions on jobs you own are ever visible.
        </div>
      </div>

      {error && <Card padding={16} style={{ background: 'var(--red-soft)' }}>{error}</Card>}

      {justIssued && (
        <Card padding={20} style={{ background: 'var(--surface-2)', border: '2px solid var(--ink)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
            Your key — copy it now, it won't be shown again
          </div>
          <pre style={{
            background: 'var(--surface)', padding: 14, borderRadius: 10, fontSize: 12.5,
            fontFamily: 'var(--font-mono)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {justIssued.connect_command}
          </pre>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <Button size="sm" onClick={() => navigator.clipboard?.writeText(justIssued.connect_command)}>
              Copy command
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setJustIssued(null)}>Dismiss</Button>
          </div>
        </Card>
      )}

      <Card padding={20}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>Your keys</div>
          <Button size="sm" icon="plus" disabled={busy} onClick={generate}>
            {busy ? 'Generating…' : 'Generate new key'}
          </Button>
        </div>

        {keys.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
            No keys yet — generate one to connect Claude Code.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {keys.map(k => (
            <div key={k.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              borderRadius: 10, border: '1px solid var(--line)',
            }}>
              <div style={{ flex: 1, fontSize: 13.5 }}>
                <div>Created {new Date(k.created_at).toLocaleDateString()}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString()}` : 'Never used'}
                </div>
              </div>
              {k.revoked_at
                ? <Tag tone="full">revoked</Tag>
                : <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}>Revoke</Button>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
