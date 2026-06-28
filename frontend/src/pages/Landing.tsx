import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Landing.css'

const INK   = '#1A1726'
const MUTED = '#6E6878'
const PAPER = '#FBF9F4'
const LINE  = '#E7E1D6'
const S2    = '#F4F1EA'
const SKY   = '#4CB2FF'
const V     = 'oklch(0.56 0.15 248)'
const V_SOFT= 'oklch(0.96 0.03 245)'
const V_INK = 'oklch(0.52 0.15 248)'
const GREEN      = 'oklch(0.42 0.13 150)'
const GREEN_SOFT = 'oklch(0.96 0.05 150)'

function ScoreRing({ pct, size = 46, sw = 4 }: { pct: number; size?: number; sw?: number }) {
  const r = (size - sw * 2) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
         style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ECE7DD" strokeWidth={sw}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={V}
              strokeWidth={sw} strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}/>
    </svg>
  )
}

function ScoreBar({ label, pct, color = V }: { label: string; pct: number; color?: string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:11, color:MUTED, fontWeight:500 }}>{label}</span>
        <span style={{ fontSize:11, color:INK, fontWeight:600, fontFamily:"'Geist Mono',monospace" }}>{pct}%</span>
      </div>
      <div style={{ height:5, background:'#ECE7DD', borderRadius:99 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:99 }}/>
      </div>
    </div>
  )
}

function NavLogo() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                     width:32, height:32, borderRadius:9, background:SKY, flexShrink:0 }}>
        <svg width={18} height={18} viewBox="0 0 64 64" fill="none">
          <g stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M49 27 A19 19 0 0 0 15 23"/>
            <path d="M15 37 A19 19 0 0 0 49 41"/>
            <path d="M50 13 L50 27 L37 27"/>
            <path d="M14 51 L14 37 L27 37"/>
          </g>
        </svg>
      </span>
      <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
                     fontSize:21, letterSpacing:'-0.02em', color:INK }}>
        <span style={{ color:SKY }}>Ni</span>deknil
      </span>
    </div>
  )
}

function FootLogo() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                     width:34, height:34, borderRadius:10, background:SKY, flexShrink:0 }}>
        <svg width={20} height={20} viewBox="0 0 64 64" fill="none">
          <g stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M49 27 A19 19 0 0 0 15 23"/>
            <path d="M15 37 A19 19 0 0 0 49 41"/>
            <path d="M50 13 L50 27 L37 27"/>
            <path d="M14 51 L14 37 L27 37"/>
          </g>
        </svg>
      </span>
      <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700,
                     fontSize:18, letterSpacing:'-0.04em', color:PAPER }}>
        <span style={{ color:SKY }}>Ni</span>deknil
      </span>
    </div>
  )
}

const CARD: React.CSSProperties = {
  background:'#fff', border:`1px solid ${LINE}`, borderRadius:20,
  padding:30, boxShadow:'0 1px 2px rgba(26,23,38,.04)',
}

const iconBox = (bg: string): React.CSSProperties => ({
  width:40, height:40, borderRadius:12, background:bg,
  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
})

const pill = (bg: string, color: string, shadow?: string): React.CSSProperties => ({
  display:'inline-flex', alignItems:'center', justifyContent:'center',
  background:bg, color, borderRadius:999, border:'none',
  cursor:'pointer', fontFamily:'inherit', fontWeight:600,
  ...(shadow ? { boxShadow:shadow } : {}),
})

export default function Landing() {
  const nav = useNavigate()
  const [tab, setTab] = useState<'recruiter'|'candidate'>('recruiter')
  const [scrolled, setScrolled] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive:true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div className={`nk-landing${mobileNavOpen ? ' nav-open' : ''}`}>

      {/* ── NAV ─────────────────────────────────────────────────────── */}
      <nav style={{ position:'sticky', top:0, zIndex:100,
                    backdropFilter:'saturate(160%) blur(14px)',
                    WebkitBackdropFilter:'saturate(160%) blur(14px)',
                    background:'rgba(251,249,244,0.78)',
                    borderBottom:`1px solid ${scrolled ? LINE : 'transparent'}`,
                    boxShadow:scrolled ? '0 8px 28px rgba(26,23,38,0.06)' : 'none',
                    transition:'border-color .3s, box-shadow .3s' }}>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 16px', height:72,
                      display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <NavLogo />
          <div data-nav-links style={{ display:'flex', alignItems:'center', gap:30, fontSize:15, color:MUTED, fontWeight:500 }}>
            {[
              {label:'For Recruiters', href:'#recruiters'},
              {label:'For Candidates', href:'#candidates'},
              {label:'Referrals',      href:'#referrals'},
              {label:'How it works',   href:'#how'},
              {label:'Pricing',        href:'#pricing'},
            ].map(({label, href}) => (
              <a key={label} href={href} className="nk-link"
                style={{ color:MUTED, textDecoration:'none' }}>
                {label}
              </a>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <button className="nk-soft" onClick={() => nav('/login')}
              style={{ background:'transparent', border:'none', borderRadius:999,
                       color:INK, padding:'9px 14px', fontSize:14, fontWeight:600,
                       cursor:'pointer', fontFamily:'inherit' }}>
              Sign in
            </button>
            <button className="nk-violet" onClick={() => nav('/register')}
              style={{ display:'flex', alignItems:'center', gap:8, fontSize:14.5, fontWeight:600,
                       color:'#fff', background:V, padding:'10px 20px', borderRadius:999,
                       border:'none', cursor:'pointer', fontFamily:'inherit',
                       boxShadow:`0 8px 20px oklch(0.56 0.15 248 / 0.28)` }}>
              Get started <span style={{ fontSize:15 }}>→</span>
            </button>
            {/* Hamburger — shown by CSS on mobile */}
            <button
              className="nk-hamburger"
              onClick={() => setMobileNavOpen(o => !o)}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileNavOpen ? (
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              ) : (
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h18"/>
                </svg>
              )}
            </button>
          </div>
        </div>
        {/* Mobile nav drawer */}
        <div className="nk-mobile-nav">
          {[
            {label:'For Recruiters', href:'#recruiters'},
            {label:'For Candidates', href:'#candidates'},
            {label:'Referrals',      href:'#referrals'},
            {label:'How it works',   href:'#how'},
            {label:'Pricing',        href:'#pricing'},
          ].map(({label, href}) => (
            <a key={label} href={href} onClick={() => setMobileNavOpen(false)}>{label}</a>
          ))}
          <div className="nk-mobile-cta">
            <button className="nk-soft" onClick={() => { setMobileNavOpen(false); nav('/login') }}
              style={{ flex:1, background:'#F4F1EA', border:`1px solid ${LINE}`, borderRadius:999,
                       color:INK, padding:'10px 16px', fontSize:14, fontWeight:600,
                       cursor:'pointer', fontFamily:'inherit' }}>
              Sign in
            </button>
            <button className="nk-violet" onClick={() => { setMobileNavOpen(false); nav('/register') }}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                       fontSize:14, fontWeight:600, color:'#fff', background:V, padding:'10px 16px',
                       borderRadius:999, border:'none', cursor:'pointer', fontFamily:'inherit' }}>
              Get started →
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section className="nk-hero-section" style={{ position:'relative', overflow:'hidden', padding:'80px 0' }}>
        <div style={{ position:'absolute', inset:'-60px -40px auto', height:520,
                      background:`radial-gradient(120% 90% at 18% 0%, ${V_SOFT} 0%, rgba(251,249,244,0) 62%)`,
                      zIndex:0, pointerEvents:'none' }}/>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 24px', position:'relative', zIndex:1 }}>
          <div className="nk-hero-grid"
               style={{ display:'grid', gridTemplateColumns:'1.02fr 1fr', gap:56, alignItems:'center' }}>

            {/* left */}
            <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:8,
                            background:'#fff', border:`1px solid ${LINE}`, borderRadius:999,
                            padding:'5px 14px 5px 5px', fontSize:13, fontWeight:500, color:MUTED,
                            width:'fit-content' }}>
                <span style={{ background:V, width:8, height:8, borderRadius:'50%', display:'inline-block' }}/>
                AI-first hiring — built for India
              </div>
              <h1 style={{ fontFamily:"'Geist',sans-serif", fontSize:'clamp(38px,5.2vw,68px)',
                           fontWeight:800, lineHeight:1.07, letterSpacing:'-0.032em', color:INK, margin:0 }}>
                Hire the best<br/>
                <span style={{ background:V_SOFT, borderRadius:6, padding:'0 6px' }}>10× faster</span>{' '}
                with<br/>AI ranking
              </h1>
              <p style={{ fontSize:19, color:MUTED, lineHeight:1.55, margin:0, maxWidth:480 }}>
                Nideknil ranks every resume in your talent pool against your JD in seconds.
                Explainable scores, AI fluency ratings, and warm referrals included.
              </p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
                <button className="nk-violet" onClick={() => nav('/register')}
                  style={{ ...pill(V,'#fff',`0 0 0 1px ${V_INK},0 14px 36px oklch(0.56 0.15 248 / 0.30)`),
                           gap:8, padding:'0 26px', height:50, fontSize:15 }}>
                  Start for free
                  <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button className="nk-soft"
                  style={{ ...pill(S2,INK), gap:8, padding:'0 26px', height:50, fontSize:15,
                           border:`1px solid ${LINE}` }}>
                  See how it works
                </button>
              </div>
              <div style={{ display:'flex', gap:32, flexWrap:'wrap', paddingTop:4 }}>
                {[{v:'2 min',l:'Average shortlist time'},{v:'92%',l:'Recruiter satisfaction'},{v:'21×',l:'Larger searchable pool'}].map(({v,l}) => (
                  <div key={l} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                    <span style={{ fontFamily:"'Geist Mono',monospace", fontSize:22, fontWeight:700, color:INK }}>{v}</span>
                    <span style={{ fontSize:13, color:MUTED }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* right — product mock */}
            <div className="nk-hero-right" style={{ position:'relative' }}>
              <div style={{ position:'absolute', inset:'14px -14px -14px 14px',
                            background:INK, borderRadius:24, zIndex:0, opacity:0.92 }}/>
              <div style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:24,
                            padding:24, boxShadow:'0 2px 12px rgba(26,23,38,0.07)',
                            position:'relative', zIndex:1 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:INK }}>Ranked shortlist</div>
                    <div style={{ fontSize:12, color:MUTED, marginTop:2 }}>Senior Frontend Engineer · Delhi NCR</div>
                  </div>
                  <span style={{ background:GREEN_SOFT, color:GREEN, borderRadius:999,
                                 padding:'3px 10px', fontSize:12, fontWeight:600 }}>~15 s</span>
                </div>
                {[
                  {rank:1,name:'Priya Sharma',role:'Ex-Flipkart',score:92,label:'Strong fit',lc:GREEN,lb:GREEN_SOFT},
                  {rank:2,name:'Aarav Mehta',role:'Ex-Swiggy',score:84,label:'Good fit',lc:SKY,lb:V_SOFT},
                  {rank:3,name:'Ritu Agarwal',role:'Ex-Razorpay',score:76,label:'Potential',lc:MUTED,lb:S2},
                ].map(({rank,name,role,score,label,lc,lb}) => (
                  <div key={rank} style={{ display:'flex', alignItems:'center', gap:12,
                                           padding:'10px 0', borderTop:rank>1?`1px solid ${LINE}`:'none' }}>
                    <span style={{ fontFamily:"'Geist Mono',monospace", fontSize:12, fontWeight:600,
                                   color:MUTED, width:16, flexShrink:0 }}>#{rank}</span>
                    <div style={{ width:34, height:34, borderRadius:'50%', flexShrink:0,
                                  background:rank===1?V_SOFT:rank===2?'#EAF5FF':S2,
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  fontSize:13, fontWeight:700, color:rank===1?V_INK:rank===2?SKY:MUTED }}>
                      {name.split(' ').map((n:string) => n[0]).join('')}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:INK,
                                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
                      <div style={{ fontSize:11, color:MUTED }}>{role}</div>
                    </div>
                    <div style={{ position:'relative', width:34, height:34, flexShrink:0 }}>
                      <ScoreRing pct={score} size={34} sw={3}/>
                      <span style={{ position:'absolute', inset:0, display:'flex',
                                     alignItems:'center', justifyContent:'center',
                                     fontSize:9, fontWeight:700, color:INK,
                                     fontFamily:"'Geist Mono',monospace" }}>{score}</span>
                    </div>
                    <span style={{ background:lb, color:lc, borderRadius:999,
                                   padding:'3px 9px', fontSize:11, fontWeight:600, flexShrink:0 }}>{label}</span>
                  </div>
                ))}
                <div style={{ marginTop:18, padding:'14px 16px', background:PAPER,
                              borderRadius:12, border:`1px solid ${LINE}` }}>
                  <div style={{ fontSize:11, fontWeight:600, color:MUTED, textTransform:'uppercase',
                                letterSpacing:'0.06em', marginBottom:10 }}>Score breakdown · #1</div>
                  <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <ScoreRing pct={92} size={52} sw={5}/>
                      <span style={{ position:'absolute', inset:0, display:'flex',
                                     alignItems:'center', justifyContent:'center',
                                     fontFamily:"'Geist Mono',monospace", fontWeight:700,
                                     fontSize:12, color:INK }}>92</span>
                    </div>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
                      <ScoreBar label="Skills match" pct={96}/>
                      <ScoreBar label="Experience" pct={88}/>
                      <ScoreBar label="AI fluency" pct={91} color={GREEN}/>
                      <ScoreBar label="Culture fit" pct={82}/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AUDIENCE SPLIT ──────────────────────────────────────────── */}
      <section style={{ padding:'0 0 80px' }} data-reveal>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 24px' }}>
          <div className="nk-audience-grid"
               style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
            {/* dark */}
            <div className="nk-dark-card nk-audience-card"
                 style={{ background:INK, borderRadius:24, padding:'48px 44px',
                          display:'flex', flexDirection:'column', gap:20, cursor:'pointer' }}
                 onClick={() => nav('/register')}>
              <span style={{ background:V, color:'#fff', borderRadius:999,
                             padding:'5px 14px', fontSize:13, fontWeight:600, width:'fit-content' }}>
                For Recruiters
              </span>
              <h2 style={{ fontFamily:"'Geist',sans-serif", fontWeight:800,
                           fontSize:'clamp(26px,3vw,38px)', color:PAPER,
                           lineHeight:1.1, letterSpacing:'-0.025em', margin:0 }}>
                Rank your entire<br/>talent pool in<br/>minutes — not days
              </h2>
              <p style={{ fontSize:16, color:'rgba(251,249,244,0.65)', lineHeight:1.55, margin:0 }}>
                Paste a JD. Every resume in your database gets an AI score with explainable reasons.
                Shortlist the top 10 in one click.
              </p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:4 }}>
                {['JD-match scoring','AI fluency test','Warm referrals','Zero ATS lock-in'].map(f => (
                  <span key={f} style={{ background:'rgba(255,255,255,0.10)', borderRadius:999,
                                         padding:'5px 12px', fontSize:12, fontWeight:500,
                                         color:'rgba(251,249,244,0.80)' }}>{f}</span>
                ))}
              </div>
              <button className="nk-white" onClick={e => { e.stopPropagation(); nav('/register') }}
                style={{ marginTop:8, alignSelf:'flex-start', background:'#fff',
                         border:`1px solid ${LINE}`, borderRadius:999, color:INK,
                         padding:'0 22px', height:44, fontSize:14, fontWeight:600,
                         cursor:'pointer', fontFamily:'inherit' }}>
                Start ranking →
              </button>
            </div>
            {/* light */}
            <div className="nk-lift nk-audience-card"
                 style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:24,
                          padding:'48px 44px', display:'flex', flexDirection:'column', gap:20, cursor:'pointer' }}
                 onClick={() => nav('/register')}>
              <span style={{ background:V_SOFT, color:V_INK, borderRadius:999,
                             padding:'5px 14px', fontSize:13, fontWeight:600,
                             width:'fit-content', border:`1px solid oklch(0.88 0.06 245)` }}>
                For Candidates
              </span>
              <h2 style={{ fontFamily:"'Geist',sans-serif", fontWeight:800,
                           fontSize:'clamp(26px,3vw,38px)', color:INK,
                           lineHeight:1.1, letterSpacing:'-0.025em', margin:0 }}>
                Get discovered by<br/>top companies<br/>through referrals
              </h2>
              <p style={{ fontSize:16, color:MUTED, lineHeight:1.55, margin:0 }}>
                Build a rich profile, earn an AI fluency score, and unlock warm referrals
                from employees at your dream companies.
              </p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:4 }}>
                {['Rich profile builder','AI fluency badge','Referral access','Transparent feedback'].map(f => (
                  <span key={f} style={{ background:S2, borderRadius:999,
                                         padding:'5px 12px', fontSize:12, fontWeight:500,
                                         color:MUTED, border:`1px solid ${LINE}` }}>{f}</span>
                ))}
              </div>
              <button className="nk-violet" onClick={e => { e.stopPropagation(); nav('/register') }}
                style={{ ...pill(V,'#fff',`0 8px 22px oklch(0.56 0.15 248 / 0.30)`),
                         marginTop:8, alignSelf:'flex-start', padding:'0 22px', height:44, fontSize:14 }}>
                Build my profile →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOR RECRUITERS BENTO ────────────────────────────────────── */}
      <section id="recruiters" style={{ padding:'20px 0 80px' }} data-reveal>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 24px' }}>
          <div style={{ marginBottom:40 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8,
                          background:V_SOFT, border:`1px solid oklch(0.88 0.06 245)`,
                          borderRadius:999, padding:'4px 14px 4px 5px', marginBottom:16 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:V, display:'inline-block' }}/>
              <span style={{ fontSize:13, fontWeight:600, color:V_INK }}>For Recruiters</span>
            </div>
            <h2 style={{ fontFamily:"'Geist',sans-serif", fontSize:'clamp(28px,3.6vw,48px)',
                         fontWeight:800, letterSpacing:'-0.028em', color:INK, lineHeight:1.1, margin:0 }}>
              Your whole pipeline.<br/>One AI-powered funnel.
            </h2>
          </div>
          <div className="nk-bento-3"
               style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18 }}>
            {/* 1: span 2 */}
            <div className="nk-lift" data-span2
                 style={{ ...CARD, gridColumn:'span 2', display:'flex', gap:28, alignItems:'flex-start' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:28, fontFamily:"'Geist Mono',monospace",
                              fontWeight:700, color:V, lineHeight:1 }}>2 min</div>
                <div style={{ fontSize:13, color:MUTED, marginTop:4 }}>from JD paste to ranked shortlist</div>
                <h3 style={{ fontFamily:"'Geist',sans-serif", fontWeight:700, fontSize:20,
                             color:INK, marginTop:16, marginBottom:8, lineHeight:1.25 }}>
                  Instant shortlist — no setup
                </h3>
                <p style={{ fontSize:14, color:MUTED, lineHeight:1.6, margin:0 }}>
                  Paste your JD and Nideknil ranks every candidate in your pool against it.
                  No integrations required.
                </p>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'center', flexShrink:0 }}>
                {[
                  {label:'All resumes',count:'1,200+',w:120,bg:S2,fg:MUTED},
                  {label:'AI scored',count:'1,200',w:100,bg:V_SOFT,fg:V_INK},
                  {label:'Top ranked',count:'~50',w:80,bg:V,fg:'#fff'},
                  {label:'Shortlisted',count:'10',w:60,bg:INK,fg:PAPER},
                ].map(({label,count,w,bg,fg}) => (
                  <div key={label} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                    <div style={{ width:w, height:34, background:bg, borderRadius:8,
                                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontFamily:"'Geist Mono',monospace", fontSize:11, fontWeight:700, color:fg }}>{count}</span>
                    </div>
                    <span style={{ fontSize:10, color:MUTED, fontWeight:500 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* 2: 21x */}
            <div className="nk-dark-card"
                 style={{ background:INK, borderRadius:20, padding:30,
                          display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ fontSize:52, fontFamily:"'Geist Mono',monospace",
                            fontWeight:700, color:V, lineHeight:1 }}>21×</div>
              <h3 style={{ fontFamily:"'Geist',sans-serif", fontWeight:700, fontSize:17,
                           color:PAPER, margin:0, lineHeight:1.3 }}>Larger searchable talent pool</h3>
              <p style={{ fontSize:13, color:'rgba(251,249,244,0.55)', lineHeight:1.6, margin:0 }}>
                Score candidates from your whole database — not just active applicants.
              </p>
            </div>
            {/* 3: explainable */}
            <div className="nk-lift" style={CARD}>
              <div style={iconBox(V_SOFT)}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <path d="M9 11l3 3L22 4" stroke={V_INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke={V_INK} strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 style={{ fontFamily:"'Geist',sans-serif", fontWeight:700, fontSize:17,
                           color:INK, margin:'12px 0 8px', lineHeight:1.3 }}>Explainable scores</h3>
              <p style={{ fontSize:13, color:MUTED, lineHeight:1.6, margin:0 }}>
                Every ranking comes with a breakdown: skills match, experience, AI fluency, and culture signals.
              </p>
            </div>
            {/* 4: AI fluency */}
            <div className="nk-lift" style={CARD}>
              <div style={iconBox(GREEN_SOFT)}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke={GREEN} strokeWidth="2"/>
                  <path d="M12 6v6l4 2" stroke={GREEN} strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 style={{ fontFamily:"'Geist',sans-serif", fontWeight:700, fontSize:17,
                           color:INK, margin:'12px 0 8px', lineHeight:1.3 }}>AI fluency assessment</h3>
              <p style={{ fontSize:13, color:MUTED, lineHeight:1.6, margin:0 }}>
                Know which candidates actually use AI tools vs. just claiming it on their resume.
              </p>
            </div>
            {/* 5: feedback */}
            <div className="nk-lift" style={CARD}>
              <div style={iconBox(V_SOFT)}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
                        stroke={V_INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 style={{ fontFamily:"'Geist',sans-serif", fontWeight:700, fontSize:17,
                           color:INK, margin:'12px 0 8px', lineHeight:1.3 }}>Feedback in one click</h3>
              <p style={{ fontSize:13, color:MUTED, lineHeight:1.6, margin:0 }}>
                Auto-send personalised AI-generated feedback to every candidate you didn't move forward.
              </p>
            </div>
            {/* 6: full row verified */}
            <div className="nk-lift" data-fullrow
                 style={{ gridColumn:'1 / -1', background:V_SOFT,
                          border:`1px solid oklch(0.88 0.06 245)`, borderRadius:20,
                          padding:'22px 30px', display:'flex', alignItems:'center',
                          gap:24, flexWrap:'wrap' }}>
              <div style={{ ...iconBox(V), background:V }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:16, color:INK }}>Verified professional profiles</div>
                <div style={{ fontSize:13, color:MUTED, marginTop:3 }}>
                  Every candidate profile is LinkedIn-verified. No fake resumes, no inflated claims.
                </div>
              </div>
              <button className="nk-violet" onClick={() => nav('/register')}
                style={{ ...pill(V,'#fff',`0 8px 20px oklch(0.56 0.15 248 / 0.30)`),
                         flexShrink:0, padding:'0 20px', height:40, fontSize:13 }}>
                Get started free →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOR CANDIDATES (DARK) ───────────────────────────────────── */}
      <section id="candidates" style={{ background:INK, padding:'80px 0' }} data-reveal>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 24px' }}>
          <div style={{ marginBottom:40 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8,
                          background:'rgba(76,178,255,0.15)', border:'1px solid rgba(76,178,255,0.30)',
                          borderRadius:999, padding:'4px 14px 4px 5px', marginBottom:16 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:V, display:'inline-block' }}/>
              <span style={{ fontSize:13, fontWeight:600, color:SKY }}>For Candidates</span>
            </div>
            <h2 style={{ fontFamily:"'Geist',sans-serif", fontSize:'clamp(28px,3.6vw,48px)',
                         fontWeight:800, letterSpacing:'-0.028em', color:PAPER, lineHeight:1.1, margin:0 }}>
              More than a resume.<br/>A verifiable career record.
            </h2>
          </div>
          <div className="nk-bento-3"
               style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18 }}>
            <div className="nk-lift-dark"
                 style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.10)',
                          borderRadius:20, padding:28, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={iconBox('rgba(76,178,255,0.18)')}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={SKY} strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="12" cy="7" r="4" stroke={SKY} strokeWidth="2"/>
                </svg>
              </div>
              <h3 style={{ fontWeight:700, fontSize:17, color:PAPER, margin:0, lineHeight:1.3 }}>
                You're not just a PDF
              </h3>
              <p style={{ fontSize:13, color:'rgba(251,249,244,0.60)', lineHeight:1.6, margin:0 }}>
                Build a structured profile with verified skills, projects, and endorsements that AI can actually understand.
              </p>
            </div>
            {/* span 2 */}
            <div className="nk-lift-dark" data-span2
                 style={{ gridColumn:'span 2', background:'rgba(76,178,255,0.10)',
                          border:'1px solid rgba(76,178,255,0.25)', borderRadius:20,
                          padding:28, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                <div>
                  <h3 style={{ fontWeight:700, fontSize:20, color:PAPER, margin:0, lineHeight:1.3 }}>
                    Prove your AI fluency
                  </h3>
                  <p style={{ fontSize:14, color:'rgba(251,249,244,0.60)', lineHeight:1.6, margin:'8px 0 0' }}>
                    Take a 5-minute live AI skills challenge. Earn a verified badge that companies trust.
                  </p>
                </div>
                <span style={{ background:V, color:'#fff', borderRadius:999, padding:'4px 12px',
                               fontSize:12, fontWeight:600, flexShrink:0 }}>New</span>
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:4 }}>
                {['Prompt engineering','Workflow automation','AI tool proficiency','LLM reasoning'].map(tag => (
                  <span key={tag} style={{ background:'rgba(76,178,255,0.18)', color:SKY,
                                           borderRadius:999, padding:'4px 12px', fontSize:12, fontWeight:500,
                                           border:'1px solid rgba(76,178,255,0.30)' }}>{tag}</span>
                ))}
              </div>
            </div>
            {[
              { icon:<svg width={18} height={18} viewBox="0 0 24 24" fill="none"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke={SKY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                title:'See your match score', body:'Know exactly where you stand before you apply — and what to improve.' },
              { icon:<svg width={18} height={18} viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke={SKY} strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke={SKY} strokeWidth="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke={SKY} strokeWidth="2" strokeLinecap="round"/></svg>,
                title:'Unlock warm referrals', body:'Get referred by verified employees at your dream company — not cold applications.' },
              { icon:<svg width={18} height={18} viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={SKY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                title:'Real feedback, always', body:'Whether shortlisted or not, get AI-generated feedback on why — so you can improve.' },
            ].map(({icon,title,body}) => (
              <div key={title} className="nk-lift-dark"
                   style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.10)',
                            borderRadius:20, padding:28, display:'flex', flexDirection:'column', gap:10 }}>
                <div style={iconBox('rgba(76,178,255,0.18)')}>{icon}</div>
                <h3 style={{ fontWeight:700, fontSize:17, color:PAPER, margin:0, lineHeight:1.3 }}>{title}</h3>
                <p style={{ fontSize:13, color:'rgba(251,249,244,0.60)', lineHeight:1.6, margin:0 }}>{body}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop:36, display:'flex', gap:12 }}>
            <button className="nk-violet" onClick={() => nav('/register')}
              style={{ ...pill(V,'#fff',`0 10px 28px oklch(0.56 0.15 248 / 0.30)`),
                       padding:'0 26px', height:48, fontSize:15 }}>
              Build my profile →
            </button>
            <button className="nk-glass"
              style={{ ...pill('rgba(255,255,255,0.08)',PAPER), padding:'0 26px', height:48, fontSize:15,
                       border:'1px solid rgba(255,255,255,0.16)' }}>
              Learn more
            </button>
          </div>
        </div>
      </section>

      {/* ── REFERRALS ───────────────────────────────────────────────── */}
      <section id="referrals" style={{ background:'#EAF5FF', position:'relative' }}>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'90px 24px' }}>

          {/* header */}
          <div data-reveal style={{ maxWidth:780, margin:'0 auto 14px', textAlign:'center' }}>
            <div style={{ fontSize:13, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase',
                          color:V_INK, marginBottom:16 }}>Referrals</div>
            <h2 style={{ fontFamily:"'Geist',sans-serif", fontSize:'clamp(32px,4.4vw,54px)',
                         lineHeight:1.03, letterSpacing:'-0.03em', fontWeight:700, margin:'0 0 18px' }}>
              Stop cold-messaging strangers.<br/>Get referred on merit.
            </h2>
            <p style={{ fontSize:18, lineHeight:1.55, color:'#4F4A57', margin:0 }}>
              The hard part of landing a job isn't the application — it's getting a real employee to vouch for you.
              Nideknil turns referrals into a fair, AI-ranked match instead of a popularity contest.
            </p>
          </div>

          {/* problem strip */}
          <div data-reveal className="nk-problem-strip" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)',
                                    gap:14, margin:'42px 0 22px' }}>
            {[
              'Candidates spam hundreds of employees on LinkedIn, hoping one replies.',
              'Employees drown in DMs and refer whoever asks loudest — not the best fit.',
              'Great candidates with no network never get the warm intro.',
            ].map(text => (
              <div key={text} style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:16,
                                       padding:'22px 24px', display:'flex', gap:13, alignItems:'flex-start' }}>
                <span style={{ flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center',
                               width:24, height:24, borderRadius:'50%', background:S2, color:'#A39A8C',
                               fontSize:14, fontWeight:700, marginTop:1 }}>×</span>
                <p style={{ fontSize:14.5, lineHeight:1.5, color:'#4F4A57', margin:0 }}>{text}</p>
              </div>
            ))}
          </div>

          {/* diagram */}
          <div data-reveal style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:24,
                                    padding:'34px 30px', boxShadow:'0 1px 2px rgba(26,23,38,.04),0 18px 44px rgba(36,118,214,0.06)',
                                    marginBottom:64 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase',
                          color:MUTED, textAlign:'center', marginBottom:26 }}>How a referral pool forms</div>
            <div style={{ display:'flex', alignItems:'stretch', justifyContent:'center', gap:14, flexWrap:'wrap' }}>

              {/* node 1: applicants */}
              <div style={{ flex:1, minWidth:170, display:'flex', flexDirection:'column',
                            alignItems:'center', textAlign:'center', gap:14 }}>
                <div style={{ display:'flex', alignItems:'center', height:118 }}>
                  <div style={{ display:'flex' }}>
                    {[{i:'JL',bg:'#1A1726',fg:'#fff'},{i:'RK',bg:'#8C7BD8',fg:'#fff'},{i:'MP',bg:'#5AA06E',fg:'#fff'},{i:'AS',bg:'#D89B5A',fg:'#fff'}].map(({i,bg,fg},idx) => (
                      <span key={i} style={{ width:38, height:38, borderRadius:'50%', background:bg, color:fg,
                                             display:'flex', alignItems:'center', justifyContent:'center',
                                             fontSize:12, fontWeight:600, border:'2px solid #fff',
                                             marginLeft:idx>0?-12:0 }}>{i}</span>
                    ))}
                    <span style={{ width:38, height:38, borderRadius:'50%', background:S2, color:MUTED,
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   fontSize:12, fontWeight:700, border:'2px solid #fff', marginLeft:-12 }}>+200</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:INK }}>200+ applicants</div>
                  <div style={{ fontSize:12.5, color:MUTED, marginTop:3 }}>Apply — no cold DMs</div>
                </div>
              </div>

              <div style={{ display:'flex', alignItems:'center', color:V, fontSize:22, paddingTop:42 }}>→</div>

              {/* node 2: AI ranking */}
              <div style={{ flex:1, minWidth:170, display:'flex', flexDirection:'column',
                            alignItems:'center', textAlign:'center', gap:14 }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                              height:118, justifyContent:'center', width:'100%' }}>
                  <div style={{ width:'100%', maxWidth:150, height:22, borderRadius:7, background:'oklch(0.94 0.04 245)' }}/>
                  <div style={{ width:'74%', maxWidth:112, height:22, borderRadius:7, background:'oklch(0.86 0.07 245)' }}/>
                  <div style={{ width:'48%', maxWidth:72, height:22, borderRadius:7, background:V,
                                boxShadow:`0 6px 16px oklch(0.56 0.15 248 / 0.3)` }}/>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:INK }}>AI ranks by fit</div>
                  <div style={{ fontSize:12.5, color:MUTED, marginTop:3 }}>Same funnel as hiring</div>
                </div>
              </div>

              <div style={{ display:'flex', alignItems:'center', color:V, fontSize:22, paddingTop:42 }}>→</div>

              {/* node 3: ranked pool */}
              <div style={{ flex:1.4, minWidth:210, display:'flex', flexDirection:'column',
                            alignItems:'center', textAlign:'center', gap:14 }}>
                <div style={{ width:'100%', background:PAPER, border:`1px solid ${LINE}`, borderRadius:14,
                              padding:10, display:'flex', flexDirection:'column', gap:6, height:118, justifyContent:'center' }}>
                  {[
                    {i:'SK',name:'Sana K.',score:'94',highlight:true},
                    {i:'RI',name:'Rhea I.',score:'91',highlight:false},
                    {i:'AM',name:'Aarav M.',score:'88',highlight:false},
                  ].map(({i,name,score,highlight}) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:9, padding:'5px 8px',
                                          borderRadius:9,
                                          background:highlight?V_SOFT:'transparent',
                                          border:highlight?`1px solid oklch(0.56 0.15 248 / 0.22)`:'none' }}>
                      <span style={{ width:22, height:22, borderRadius:'50%',
                                     background:highlight?INK:S2, color:highlight?'#fff':INK,
                                     display:'flex', alignItems:'center', justifyContent:'center',
                                     fontSize:9, fontWeight:600 }}>{i}</span>
                      <span style={{ flex:1, textAlign:'left', fontSize:12, fontWeight:600, color:INK }}>{name}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:highlight?V_INK:MUTED }}>{score}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:INK }}>Ranked pool · Top 15</div>
                  <div style={{ fontSize:12.5, color:MUTED, marginTop:3 }}>+ waitlist (10)</div>
                </div>
              </div>

              <div style={{ display:'flex', alignItems:'center', color:V, fontSize:22, paddingTop:42 }}>→</div>

              {/* node 4: verified employee */}
              <div style={{ flex:1, minWidth:170, display:'flex', flexDirection:'column',
                            alignItems:'center', textAlign:'center', gap:14 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:118 }}>
                  <div style={{ position:'relative' }}>
                    <span style={{ width:58, height:58, borderRadius:'50%', background:V_SOFT,
                                   border:`2px solid oklch(0.56 0.15 248 / 0.3)`,
                                   color:'oklch(0.46 0.15 248)', display:'flex', alignItems:'center',
                                   justifyContent:'center', fontSize:18, fontWeight:700 }}>DV</span>
                    <span style={{ position:'absolute', bottom:-2, right:-2, width:24, height:24,
                                   borderRadius:'50%', background:SKY, color:'#fff',
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   fontSize:13, fontWeight:700, border:'2.5px solid #fff' }}>✓</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:INK }}>Verified employee</div>
                  <div style={{ fontSize:12.5, color:MUTED, marginTop:3 }}>Refers the top picks</div>
                </div>
              </div>
            </div>
          </div>

          {/* how it works: candidates + employees */}
          <div data-reveal style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:64 }}>
            {/* candidates */}
            <div style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:22,
                          padding:'34px 32px', boxShadow:'0 1px 2px rgba(26,23,38,.04)' }}>
              <div style={{ fontSize:12, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase',
                            color:V_INK, marginBottom:18 }}>For candidates</div>
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                {[
                  {n:1,title:'Find an open referral post',desc:'For a specific role at a real, named company.',last:false},
                  {n:2,title:'Apply with your resume',desc:'No cold DMs, no begging for a reply.',last:false},
                  {n:3,title:'Get ranked into the pool',desc:'AI ranks every applicant by fit — pool (top 15) or waitlist (top 10).',last:false},
                  {n:4,title:'Get a warm referral',desc:'In the pool when the post closes? The employee refers you internally.',last:true},
                ].map(({n,title,desc,last}) => (
                  <div key={n} style={{ display:'flex', gap:15 }}>
                    <span style={{ flexShrink:0, width:28, height:28, borderRadius:'50%',
                                   background:last?V:V_SOFT, color:last?'#fff':V_INK,
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   fontSize:13, fontWeight:700 }}>{n}</span>
                    <div>
                      <div style={{ fontSize:15.5, fontWeight:600, marginBottom:3 }}>{title}</div>
                      <div style={{ fontSize:14, lineHeight:1.5, color:MUTED }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* employees */}
            <div style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:22,
                          padding:'34px 32px', boxShadow:'0 1px 2px rgba(26,23,38,.04)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
                <span style={{ fontSize:12, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:V_INK }}>
                  For employees
                </span>
                <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:10.5, fontWeight:700,
                               color:'oklch(0.46 0.15 248)', background:V_SOFT, padding:'3px 8px', borderRadius:999 }}>
                  <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                                 width:13, height:13, borderRadius:'50%', background:SKY,
                                 color:'#fff', fontSize:9 }}>✓</span>
                  Verified only
                </span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                {[
                  {n:1,title:'Open a referral post',desc:'For a role at your company, in seconds.',last:false},
                  {n:2,title:'Verify you work there',desc:'Via LinkedIn or an AI-checked work-email domain. Only verified employees refer.',last:false},
                  {n:3,title:'See the strongest first',desc:'Applicants auto-ranked by match score — not by who\'s loudest.',last:false},
                  {n:4,title:'Refer before the window closes',desc:'5-day window. Earn your referral bonus on candidates who actually fit.',last:true},
                ].map(({n,title,desc,last}) => (
                  <div key={n} style={{ display:'flex', gap:15 }}>
                    <span style={{ flexShrink:0, width:28, height:28, borderRadius:'50%',
                                   background:last?V:V_SOFT, color:last?'#fff':V_INK,
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   fontSize:13, fontWeight:700 }}>{n}</span>
                    <div>
                      <div style={{ fontSize:15.5, fontWeight:600, marginBottom:3 }}>{title}</div>
                      <div style={{ fontSize:14, lineHeight:1.5, color:MUTED }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* what makes it different */}
          <div data-reveal style={{ marginBottom:56 }}>
            <h3 style={{ fontFamily:"'Geist',sans-serif", fontSize:'clamp(24px,2.8vw,32px)',
                         lineHeight:1.1, letterSpacing:'-0.025em', fontWeight:700,
                         textAlign:'center', margin:'0 0 32px' }}>What makes it different</h3>
            <div className="nk-diff-6"
                 style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:18 }}>
              {[
                {icon:'▲', iconBg:V, iconColor:'#fff', title:'Merit-ranked, not first-come',
                 desc:'The same AI funnel that powers Nideknil\'s hiring ranks every referral applicant by real fit. Referrers refer the best match — not the best networker.', span:2},
                {icon:'✓', iconBg:SKY, iconColor:'#fff', title:'Verified employees only',
                 desc:'Every referrer is identity-verified through LinkedIn or an AI-checked work-email domain — so a referral actually means something.', span:2},
                {icon:'◎', iconBg:V, iconColor:'#fff', title:'A live, competitive pool',
                 desc:'Pool (15) + waitlist (10), ranked by score. A stronger applicant can displace a weaker one — the shortlist always reflects the best available talent, transparently.', span:2},
              ].map(({icon,iconBg,iconColor,title,desc,span}) => (
                <div key={title} className="nk-lift"
                     data-span2
                     style={{ gridColumn:`span ${span}`, background:'#fff', border:`1px solid ${LINE}`,
                              borderRadius:20, padding:28 }}>
                  <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                                width:38, height:38, borderRadius:11, background:iconBg, color:iconColor,
                                fontSize:17, marginBottom:15 }}>{icon}</div>
                  <h4 style={{ fontSize:18, fontWeight:600, letterSpacing:'-0.02em', margin:'0 0 8px' }}>{title}</h4>
                  <p style={{ fontSize:14, lineHeight:1.5, color:MUTED, margin:0 }}>{desc}</p>
                </div>
              ))}
              {/* dark wide card */}
              <div className="nk-lift" data-span3
                   style={{ gridColumn:'span 3', background:INK, border:`1px solid ${INK}`,
                            borderRadius:20, padding:28, color:PAPER,
                            display:'flex', alignItems:'center', gap:22 }}>
                <div style={{ flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center',
                              width:64, height:64, borderRadius:16, background:V, color:'#fff',
                              fontSize:22, fontWeight:700, fontFamily:"'Space Grotesk',sans-serif" }}>5d</div>
                <div>
                  <h4 style={{ fontSize:18, fontWeight:600, letterSpacing:'-0.02em', margin:'0 0 8px', color:'#fff' }}>Time-boxed urgency</h4>
                  <p style={{ fontSize:14, lineHeight:1.5, color:'rgba(251,249,244,0.66)', margin:0 }}>
                    Posts auto-close within 5 days, so candidates get a real answer fast and roles don't go stale.
                  </p>
                </div>
              </div>
              {/* light wide card */}
              <div className="nk-lift" data-span3
                   style={{ gridColumn:'span 3', background:'#fff', border:`1px solid ${LINE}`,
                            borderRadius:20, padding:28, display:'flex', alignItems:'center', gap:22 }}>
                <div style={{ flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center',
                              width:64, height:64, borderRadius:16, background:V_SOFT,
                              color:'oklch(0.46 0.15 248)', fontSize:26 }}>⇋</div>
                <div>
                  <h4 style={{ fontSize:18, fontWeight:600, letterSpacing:'-0.02em', margin:'0 0 8px' }}>More than one way in</h4>
                  <p style={{ fontSize:14, lineHeight:1.5, color:MUTED, margin:0 }}>
                    Multiple employees can open a post for the same role — your odds aren't locked to one person,
                    and popular roles stay liquid with several referrers competing to refer the best.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* closing CTA */}
          <div data-reveal style={{ textAlign:'center', maxWidth:720, margin:'0 auto' }}>
            <p style={{ fontFamily:"'Geist',sans-serif", fontSize:'clamp(18px,2.1vw,23px)',
                        lineHeight:1.45, fontWeight:500, letterSpacing:'-0.015em',
                        color:INK, margin:'0 0 28px' }}>
              Candidates get a warm intro on merit. Employees get a curated shortlist instead of a flooded inbox.
              Companies get referrals that actually fit.
            </p>
            <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
              <button className="nk-violet" onClick={() => nav('/referrals')}
                style={{ ...pill(V,'#fff',`0 12px 28px oklch(0.56 0.15 248 / 0.30)`),
                         gap:9, padding:'15px 28px', fontSize:16 }}>
                Find a referrer →
              </button>
              <button className="nk-sky-outline" onClick={() => nav('/register')}
                style={{ display:'flex', alignItems:'center', gap:9, fontSize:16, fontWeight:600,
                         color:'oklch(0.46 0.15 248)', background:'#fff',
                         border:'1px solid oklch(0.56 0.15 248 / 0.4)',
                         padding:'15px 28px', borderRadius:999, cursor:'pointer', fontFamily:'inherit' }}>
                Open a referral post
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
      <section id="how" style={{ maxWidth:1200, margin:'0 auto', padding:'84px 24px' }}>
        <div data-reveal style={{ textAlign:'center', maxWidth:640, margin:'0 auto 38px' }}>
          <div style={{ fontSize:13, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase',
                        color:V_INK, marginBottom:16 }}>How it works</div>
          <h2 style={{ fontFamily:"'Geist',sans-serif", fontSize:'clamp(32px,4.2vw,52px)',
                       lineHeight:1.05, letterSpacing:'-0.03em', fontWeight:700, margin:'0 0 24px' }}>
            Four steps. Two paths.
          </h2>
          {/* pill tabs */}
          <div style={{ display:'inline-flex', background:S2, border:`1px solid ${LINE}`,
                        borderRadius:999, padding:5 }}>
            {(['recruiter','candidate'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:14, fontWeight:600,
                         padding:'10px 22px', borderRadius:999, transition:'all .25s ease',
                         background: tab===t ? '#fff' : 'transparent',
                         color: tab===t ? INK : MUTED,
                         boxShadow: tab===t ? '0 1px 3px rgba(26,23,38,0.12)' : 'none' }}>
                {t==='recruiter' ? 'Recruiter path' : 'Candidate path'}
              </button>
            ))}
          </div>
        </div>

        <div className="nk-steps-4"
             style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:18 }}>
          {(tab==='recruiter' ? [
            {n:'01', title:'Post a verified role',    desc:'Sign in with LinkedIn, get verified to your employer, and write the JD.'},
            {n:'02', title:'Run the ranking',         desc:'The funnel scans your whole base and returns the top 20 in ~15 seconds.'},
            {n:'03', title:'Read the why',            desc:'Open any candidate for the 5-factor score, strengths, risks and a recommendation.'},
            {n:'04', title:'Shortlist & learn',       desc:'Contact, interview, hire — log actions and rankings sharpen over time.', highlight:true},
          ] : [
            {n:'01', title:'Sign in with LinkedIn',   desc:'Verified onboarding in seconds — and it\'s free, always.'},
            {n:'02', title:'Upload your resume',      desc:'AI builds a structured profile and normalizes your skills against 500+.'},
            {n:'03', title:'Get ranked & found',      desc:'Surface in recruiter shortlists and referral pools for roles you fit.'},
            {n:'04', title:'Show AI fluency',         desc:'Stand out with a modern signal employers actually care about.', highlight:true},
          ]).map(({n,title,desc,highlight}) => (
            <div key={n} style={{ background: highlight ? V_SOFT : '#fff',
                                   border: highlight ? `1px solid oklch(0.56 0.15 248 / 0.18)` : `1px solid ${LINE}`,
                                   borderRadius:20, padding:28 }}>
              <div style={{ fontFamily:"'Geist Mono',monospace", fontSize:13, color:V_INK,
                            fontWeight:500, marginBottom:16 }}>{n}</div>
              <h3 style={{ fontSize:18, fontWeight:600, letterSpacing:'-0.02em',
                           margin:'0 0 8px', color:INK }}>{title}</h3>
              <p style={{ fontSize:14, lineHeight:1.5, color:MUTED, margin:0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── OUTCOMES BAND ───────────────────────────────────────────── */}
      <section data-reveal style={{ maxWidth:1200, margin:'0 auto', padding:'24px 24px 24px' }}>
        <div style={{ background:S2, border:`1px solid ${LINE}`, borderRadius:24, padding:'48px 40px' }}>
          <div style={{ textAlign:'center', maxWidth:560, margin:'0 auto 36px' }}>
            <h2 style={{ fontFamily:"'Geist',sans-serif", fontSize:'clamp(26px,3.2vw,38px)',
                         lineHeight:1.12, letterSpacing:'-0.03em', fontWeight:700, margin:'0 0 10px' }}>
              Replace hours of screening with seconds of ranking.
            </h2>
            <p style={{ fontSize:15, color:MUTED, margin:0 }}>A ranked, explained shortlist — not a pile of resumes.</p>
          </div>
          <div className="nk-stats-3"
               style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18 }}>
            {[
              {v:'~15s',     l:'Top 20 ranked'},
              {v:'500+',     l:'Skills normalized'},
              {v:'5-factor', l:'Explainable scoring'},
            ].map(({v,l}) => (
              <div key={l} style={{ background:'#fff', border:`1px solid ${LINE}`,
                                    borderRadius:18, padding:28, textAlign:'center' }}>
                <div style={{ fontSize:40, fontWeight:700, letterSpacing:'-0.03em', lineHeight:1 }}>{v}</div>
                <div style={{ fontSize:14, color:MUTED, fontWeight:500, marginTop:8 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign:'center', marginTop:22, fontFamily:"'Geist Mono',monospace",
                        fontSize:11.5, color:MUTED, letterSpacing:'0.02em' }}>
            * Illustrative figures — for demonstration only
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────── */}
      <section id="pricing" style={{ maxWidth:1200, margin:'0 auto', padding:'80px 24px' }}>
        <div data-reveal style={{ textAlign:'center', maxWidth:600, margin:'0 auto 46px' }}>
          <div style={{ fontSize:13, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase',
                        color:V_INK, marginBottom:16 }}>Pricing</div>
          <h2 style={{ fontFamily:"'Geist',sans-serif", fontSize:'clamp(32px,4.2vw,52px)',
                       lineHeight:1.05, letterSpacing:'-0.03em', fontWeight:700, margin:'0 0 14px' }}>
            For recruiters. Free for candidates.
          </h2>
          <p style={{ fontSize:16, color:MUTED, margin:0 }}>
            Candidates never pay. Recruiters pick a plan that scales with hiring.
          </p>
        </div>

        <div data-reveal className="nk-pricing-3"
             style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18, alignItems:'start' }}>

          {/* Starter */}
          <div className="nk-lift"
               style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:20, padding:32 }}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Starter</div>
            <div style={{ fontSize:13, color:MUTED, marginBottom:20 }}>Ranking only</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:6 }}>
              <span style={{ fontSize:38, fontWeight:700, letterSpacing:'-0.03em' }}>₹4,999</span>
              <span style={{ fontSize:14, color:MUTED }}>/mo</span>
            </div>
            <div style={{ height:1, background:LINE, margin:'22px 0' }}/>
            <div style={{ display:'flex', flexDirection:'column', gap:11, fontSize:14, color:INK }}>
              {['Whole-base ranking','Top 20 per role, daily','Shortlist & pipeline'].map(f => (
                <div key={f} style={{ display:'flex', gap:10 }}>
                  <span style={{ color:V }}>✓</span> {f}
                </div>
              ))}
            </div>
            <button className="nk-soft" onClick={() => nav('/register')}
              style={{ display:'block', textAlign:'center', width:'100%', marginTop:26,
                       fontSize:14.5, fontWeight:600, padding:13, borderRadius:999,
                       background:S2, color:INK, border:'none', cursor:'pointer', fontFamily:'inherit' }}>
              Choose Starter
            </button>
          </div>

          {/* Growth */}
          <div className="nk-lift"
               style={{ position:'relative', background:INK, color:PAPER, borderRadius:20,
                        padding:32, boxShadow:'0 24px 50px rgba(26,23,38,0.22)' }}>
            <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)',
                          background:V, color:'#fff', fontSize:11, fontWeight:700,
                          letterSpacing:'0.04em', padding:'6px 14px', borderRadius:999,
                          whiteSpace:'nowrap' }}>MOST POPULAR</div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6, color:'#fff' }}>Growth</div>
            <div style={{ fontSize:13, color:'oklch(0.80 0.10 245)', marginBottom:20 }}>
              AI Fluency + assessment credits
            </div>
            <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:6 }}>
              <span style={{ fontSize:38, fontWeight:700, letterSpacing:'-0.03em', color:'#fff' }}>₹14,999</span>
              <span style={{ fontSize:14, color:'rgba(251,249,244,0.6)' }}>/mo</span>
            </div>
            <div style={{ height:1, background:'rgba(251,249,244,0.14)', margin:'22px 0' }}/>
            <div style={{ display:'flex', flexDirection:'column', gap:11, fontSize:14, color:PAPER }}>
              {['Everything in Starter','AI Fluency scoring','Assessment credits','Verified company-matching'].map(f => (
                <div key={f} style={{ display:'flex', gap:10 }}>
                  <span style={{ color:'oklch(0.80 0.10 245)' }}>✓</span> {f}
                </div>
              ))}
            </div>
            <button className="nk-violet" onClick={() => nav('/register')}
              style={{ display:'block', textAlign:'center', width:'100%', marginTop:26,
                       fontSize:14.5, fontWeight:600, padding:13, borderRadius:999,
                       background:V, color:'#fff', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
              Choose Growth
            </button>
          </div>

          {/* Enterprise */}
          <div className="nk-lift"
               style={{ background:'#fff', border:`1px solid ${LINE}`, borderRadius:20, padding:32 }}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Enterprise</div>
            <div style={{ fontSize:13, color:MUTED, marginBottom:20 }}>Unlimited + SSO</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:6 }}>
              <span style={{ fontSize:38, fontWeight:700, letterSpacing:'-0.03em' }}>Custom</span>
            </div>
            <div style={{ height:1, background:LINE, margin:'22px 0' }}/>
            <div style={{ display:'flex', flexDirection:'column', gap:11, fontSize:14, color:INK }}>
              {['Everything in Growth','Unlimited ranking','SSO & advanced controls'].map(f => (
                <div key={f} style={{ display:'flex', gap:10 }}>
                  <span style={{ color:V }}>✓</span> {f}
                </div>
              ))}
            </div>
            <button className="nk-soft" onClick={() => {}}
              style={{ display:'block', textAlign:'center', width:'100%', marginTop:26,
                       fontSize:14.5, fontWeight:600, padding:13, borderRadius:999,
                       background:S2, color:INK, border:'none', cursor:'pointer', fontFamily:'inherit' }}>
              Talk to us
            </button>
          </div>
        </div>
        <div style={{ textAlign:'center', marginTop:22, fontFamily:"'Geist Mono',monospace",
                      fontSize:11.5, color:MUTED }}>
          * Placeholder pricing — illustrative only
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────────── */}
      <section data-reveal style={{ maxWidth:1200, margin:'0 auto', padding:'24px 24px 84px' }}>
        <div style={{ position:'relative', background:V, borderRadius:28,
                      padding:'72px 40px', textAlign:'center', overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0,
                        background:'radial-gradient(80% 120% at 50% -10%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%)',
                        pointerEvents:'none' }}/>
          <h2 style={{ position:'relative', fontFamily:"'Geist',sans-serif",
                       fontSize:'clamp(30px,4vw,52px)', lineHeight:1.05,
                       letterSpacing:'-0.03em', fontWeight:700, margin:'0 0 16px', color:'#fff' }}>
            Flip recruiting on its head.
          </h2>
          <p style={{ position:'relative', fontSize:18, lineHeight:1.5,
                      color:'rgba(255,255,255,0.85)', maxWidth:480, margin:'0 auto 32px' }}>
            Instead of hunting candidates, let AI rank the whole base for you — explainably, in seconds.
          </p>
          <div style={{ position:'relative', display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
            <button className="nk-white" onClick={() => nav('/register')}
              style={{ fontSize:16, fontWeight:600, color:'oklch(0.47 0.15 248)',
                       background:'#fff', padding:'15px 30px', borderRadius:999,
                       border:'none', cursor:'pointer', fontFamily:'inherit' }}>
              Get started
            </button>
            <button className="nk-glass" onClick={() => nav('/login')}
              style={{ display:'flex', alignItems:'center', gap:9, fontSize:16, fontWeight:600,
                       color:'#fff', background:'rgba(255,255,255,0.14)',
                       border:'1px solid rgba(255,255,255,0.3)', padding:'15px 30px',
                       borderRadius:999, cursor:'pointer', fontFamily:'inherit' }}>
              <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                             width:22, height:22, borderRadius:5, background:'#0A66C2',
                             color:'#fff', fontSize:12, fontWeight:700 }}>in</span>
              Sign in with LinkedIn
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer style={{ background:INK, color:PAPER }}>
        <div className="nk-footer-grid"
             style={{ maxWidth:1200, margin:'0 auto', padding:'64px 24px 40px',
                      display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr 1fr', gap:40 }}>
          {/* brand */}
          <div>
            <FootLogo />
            <p style={{ fontSize:14, lineHeight:1.5, color:'rgba(251,249,244,0.55)',
                        margin:'18px 0 14px', maxWidth:280 }}>
              AI ranks your whole candidate base for any role — explainably, in seconds.
            </p>
            <div style={{ fontFamily:"'Geist Mono',monospace", fontSize:12,
                          color:'rgba(251,249,244,0.4)' }}>
              LinkedIn, flipped. · nideknil.ai
            </div>
          </div>
          {/* Product */}
          <div>
            <div style={{ fontSize:12, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase',
                          color:'rgba(251,249,244,0.4)', marginBottom:16 }}>Product</div>
            <div style={{ display:'flex', flexDirection:'column', gap:11, fontSize:14,
                          color:'rgba(251,249,244,0.7)' }}>
              {[{l:'For Recruiters',h:'#recruiters'},{l:'For Candidates',h:'#candidates'},
                {l:'How it works',h:'#how'},{l:'Pricing',h:'#pricing'}].map(({l,h}) => (
                <a key={l} href={h} className="nk-foot" style={{ color:'rgba(251,249,244,0.7)' }}>{l}</a>
              ))}
            </div>
          </div>
          {/* Company */}
          <div>
            <div style={{ fontSize:12, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase',
                          color:'rgba(251,249,244,0.4)', marginBottom:16 }}>Company</div>
            <div style={{ display:'flex', flexDirection:'column', gap:11, fontSize:14,
                          color:'rgba(251,249,244,0.7)' }}>
              {['About','Careers','Blog','Contact'].map(l => (
                <a key={l} href="#" className="nk-foot" style={{ color:'rgba(251,249,244,0.7)' }}>{l}</a>
              ))}
            </div>
          </div>
          {/* Legal */}
          <div>
            <div style={{ fontSize:12, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase',
                          color:'rgba(251,249,244,0.4)', marginBottom:16 }}>Legal</div>
            <div style={{ display:'flex', flexDirection:'column', gap:11, fontSize:14,
                          color:'rgba(251,249,244,0.7)' }}>
              {['Privacy','Terms','Security'].map(l => (
                <a key={l} href="#" className="nk-foot" style={{ color:'rgba(251,249,244,0.7)' }}>{l}</a>
              ))}
            </div>
          </div>
        </div>
        {/* bottom bar */}
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'22px 24px',
                      borderTop:'1px solid rgba(251,249,244,0.1)',
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                      flexWrap:'wrap', gap:14 }}>
          <div style={{ fontSize:13, color:'rgba(251,249,244,0.45)' }}>© 2026 Nideknil. All rights reserved.</div>
          <div style={{ display:'flex', gap:10 }}>
            {['in','X'].map(s => (
              <a key={s} href="#" className="nk-foot-icon"
                style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                         width:34, height:34, borderRadius:9, background:'rgba(251,249,244,0.08)',
                         fontSize:13, fontWeight:700, color:'#fff',
                         textDecoration:'none' }}>{s}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
