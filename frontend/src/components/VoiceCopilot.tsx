import { useEffect, useRef, useState } from 'react'
import { endVoiceSession, mintVoiceSession } from '../api/assignments'
import { Button, Card, Tag } from './ui'

// OpenAI's SDP-exchange endpoint for a browser-direct WebRTC Realtime connection.
// VERIFY this path against live OpenAI docs before shipping — it has moved across
// realtime beta revisions and this repo has no way to test it without a real key.
const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'

// Matches backend config.py's VOICE_SESSION_MAX_DURATION_SECONDS default — the
// backend also enforces this server-side via the OpenAI session's `expires_after`,
// this is just the client-side countdown/auto-close, not the real cost cap.
const FALLBACK_MAX_DURATION_SECONDS = 600

type Caption = { role: 'recruiter' | 'copilot'; text: string; id: string }
type Status = 'idle' | 'connecting' | 'connected' | 'error'

export default function VoiceCopilot({ submissionId }: { submissionId: number }) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [captions, setCaptions] = useState<Caption[]>([])
  const [secondsLeft, setSecondsLeft] = useState(FALLBACK_MAX_DURATION_SECONDS)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const voiceSessionIdRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    dcRef.current?.close()
    dcRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const stop = () => {
    cleanup()
    const vsId = voiceSessionIdRef.current
    voiceSessionIdRef.current = null
    if (vsId != null) {
      // Best-effort only — the real cost cap is the server-side expires_after
      // bound set at mint time, not this cleanup call.
      endVoiceSession(vsId).catch(() => {})
    }
    setStatus('idle')
    setCaptions([])
  }

  useEffect(() => {
    // Deliberately NOT tearing the call down on `visibilitychange` — a recruiter
    // briefly switching tabs (or a mobile OS permission/notification overlay
    // stealing focus for a moment right after the mic prompt) would fire this and
    // kill a call that's otherwise fine. `beforeunload` (an actual page close/nav)
    // is the only automatic teardown; the hard duration cap below is the real
    // cost backstop regardless.
    window.addEventListener('beforeunload', stop)
    return () => {
      window.removeEventListener('beforeunload', stop)
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const appendCaption = (role: Caption['role'], text: string) => {
    setCaptions(prev => [...prev, { role, text, id: `${Date.now()}-${prev.length}` }])
  }

  const onDataChannelMessage = (raw: string) => {
    let event: any
    try { event = JSON.parse(raw) } catch { return }
    if (event.type === 'response.audio_transcript.delta' && event.delta) {
      appendCaption('copilot', event.delta)
    } else if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
      appendCaption('recruiter', event.transcript)
    } else if (event.type === 'error') {
      setError(event.error?.message || 'Realtime session error')
    }
  }

  const start = async () => {
    setError('')
    setStatus('connecting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const minted = await mintVoiceSession(submissionId)
      voiceSessionIdRef.current = minted.voice_session_id

      const pc = new RTCPeerConnection()
      pcRef.current = pc
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      pc.ontrack = (e) => {
        if (audioRef.current) audioRef.current.srcObject = e.streams[0]
      }

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      dc.onmessage = (e) => onDataChannelMessage(e.data)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpResp = await fetch(`${OPENAI_REALTIME_CALLS_URL}?model=${encodeURIComponent(minted.model)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${minted.client_secret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })
      if (!sdpResp.ok) throw new Error(`OpenAI WebRTC handshake failed (${sdpResp.status})`)
      const answerSdp = await sdpResp.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

      setStatus('connected')
      // Count down from the backend's own duration cap directly — no Date math
      // against expires_at, so client/server clock skew can't affect this.
      setSecondsLeft(minted.max_duration_seconds || FALLBACK_MAX_DURATION_SECONDS)
      timerRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) { stop(); return 0 }
          return s - 1
        })
      }, 1000)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Could not start voice session')
      cleanup()
      setStatus('error')
    }
  }

  return (
    <Card padding={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>
            Talk to Copilot
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Full-duplex voice — ask about this candidate, hear it back, live.
          </div>
        </div>
        {status === 'connected' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tag tone="match">live · {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</Tag>
            <Button variant="ghost" size="sm" onClick={stop}>Stop</Button>
          </div>
        ) : (
          <Button size="sm" onClick={start} disabled={status === 'connecting'}>
            {status === 'connecting' ? 'Connecting…' : '🎙 Talk to Copilot'}
          </Button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--amber-ink)' }}>{error}</div>
      )}

      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

      {captions.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
          {captions.map(c => (
            <div key={c.id} style={{
              fontSize: 13, padding: '6px 10px', borderRadius: 8, maxWidth: '85%',
              alignSelf: c.role === 'recruiter' ? 'flex-end' : 'flex-start',
              background: c.role === 'recruiter' ? 'var(--violet)' : 'var(--surface-2)',
              color: c.role === 'recruiter' ? '#fff' : 'inherit',
            }}>
              {c.text}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
