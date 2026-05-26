import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckSquare, AlertTriangle, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

function StatChip({ label, value, color }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-xl border border-edge bg-glass">
      <span className="text-[22px] font-extrabold" style={{ color, letterSpacing: '-0.4px' }}>{value}</span>
      <span className="text-[10.5px] text-ink-muted font-semibold uppercase tracking-[0.04em]">{label}</span>
    </div>
  )
}

export default function Login() {
  const { t, i18n } = useTranslation()
  const { signIn, agentBlocked } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isHe = i18n.language === 'he'

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const err = await signIn(email, password)
    setLoading(false)
    if (err) { setError(err.message); return }
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface relative overflow-hidden">
      {/* Atmospheric gradient mesh */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: [
            'radial-gradient(at 14% 18%, rgba(63,181,143,0.25), transparent 40%)',
            'radial-gradient(at 88% 88%, rgba(125,217,162,0.12), transparent 45%)',
            'radial-gradient(at 88% 14%, rgba(63,181,143,0.10), transparent 50%)',
          ].join(','),
        }}
      />

      {/* Subtle grid */}
      <svg width="100%" height="100%" className="absolute inset-0 opacity-25 pointer-events-none">
        <defs>
          <pattern id="login-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#login-grid)" />
      </svg>

      {/* ── Mobile header (hidden on desktop) ────────────────── */}
      <div className="relative md:hidden shrink-0 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5 py-4">
          <img
            src="/wash-logo.png"
            alt="Wash"
            className="w-9 h-9 rounded-xl object-contain"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
          <span className="text-[16px] font-extrabold text-ink" style={{ letterSpacing: '-0.3px' }}>
            wash<span style={{ color: 'var(--color-agent)' }}>/agent</span>
          </span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] pb-2" style={{ color: 'var(--color-agent)' }}>
          Internal · Agent only
        </p>
      </div>

      {/* ── Desktop left brand pane (hidden on mobile) ────────── */}
      <div className="relative hidden md:flex md:w-[52%] p-16 flex-col justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/wash-logo.png"
            alt="Wash"
            className="w-10 h-10 rounded-xl object-contain"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
          <span className="text-[16px] font-extrabold text-ink" style={{ letterSpacing: '-0.3px' }}>
            wash<span style={{ color: 'var(--color-agent)' }}>/agent</span>
          </span>
        </div>

        <div dir="ltr">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--color-agent)', marginBottom: 14 }}>
            Internal · Agent only
          </p>
          <h1 className="text-5xl lg:text-6xl font-extrabold text-ink leading-[1.05] max-w-[18ch]" style={{ letterSpacing: '-1.4px', marginBottom: 12, textWrap: 'balance' }}>
            Keep the queue moving.
          </h1>
          <p className="text-[15px] text-ink-muted leading-relaxed max-w-[380px]">
            Triage conversations, approve completed jobs, and resolve
            tickets — all in one live, dark workspace.
          </p>

          <div className="flex gap-3.5 mt-7">
            <StatChip label="Avg first reply"  value="6m"  color="var(--color-accent)" />
            <StatChip label="CSAT this week"   value="4.7" color="var(--color-warning)" />
            <StatChip label="Agents online"    value="4"   color="var(--color-agent)" />
          </div>
        </div>

        <p className="text-[11.5px] text-ink-subtle">
          © 2026 Wash · Support platform
        </p>
      </div>

      {/* ── Login form pane ──────────────────────────────────── */}
      <div className="relative flex-1 flex items-start md:items-center justify-center px-4 py-6 md:p-8">
        <div
          dir={isHe ? 'rtl' : 'ltr'}
          className="w-full max-w-[400px] p-6 md:p-[30px] rounded-2xl border border-edge md:ms-auto"
          style={{
            background: 'rgba(20,22,30,0.7)',
            backdropFilter: 'blur(30px) saturate(160%)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}
        >
          {/* Portal label */}
          <div className="flex items-center gap-2 mb-1">
            <CheckSquare size={16} style={{ color: 'var(--color-agent)' }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: 'var(--color-agent)' }}>
              Agent portal
            </span>
          </div>

          <h2 className="text-xl md:text-[22px] font-extrabold text-ink mb-1" style={{ letterSpacing: '-0.5px' }}>
            {t('login.title', { defaultValue: 'Sign in to continue' })}
          </h2>
          <p className="text-xs md:text-[12.5px] text-ink-muted mb-6">
            {t('login.subtitle', { defaultValue: 'Accounts are provisioned by an admin.' })}
          </p>

          {agentBlocked && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 mb-4 text-sm text-danger">
              {t('login.agentsOnly')}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <label className={`block text-[11px] font-semibold text-ink-muted mb-1.5 ${isHe ? 'tracking-normal font-bold' : 'tracking-[0.03em]'}`}>
                {t('login.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full h-12 rounded-xl border border-edge bg-surface-elevated px-4 text-sm text-ink outline-none placeholder:text-ink-subtle transition focus:border-agent focus:ring-1 focus:ring-agent/30"
                placeholder="agent@wash.co.il"
                autoComplete="email"
              />
            </div>

            <div>
              <label className={`block text-[11px] font-semibold text-ink-muted mb-1.5 ${isHe ? 'tracking-normal font-bold' : 'tracking-[0.03em]'}`}>
                {t('login.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full h-12 rounded-xl border border-edge bg-surface-elevated px-4 text-sm text-ink outline-none placeholder:text-ink-subtle transition focus:border-agent focus:ring-1 focus:ring-agent/30"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-[13px] text-danger">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 h-12 rounded-xl border-none text-white font-bold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98]"
              style={{
                background: `linear-gradient(180deg, var(--color-agent), var(--color-agent-deep))`,
                boxShadow: '0 8px 22px rgba(63,181,143,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            >
              {loading ? t('login.submitting') : t('login.submit', { defaultValue: 'Continue to dashboard' })}
              {!loading && <ChevronRight size={16} strokeWidth={3} />}
            </button>
          </form>

          {/* Agents-only notice */}
          <div className="mt-4 px-3 py-2.5 rounded-xl flex gap-2.5 items-start border bg-warning/[0.08] border-warning/20">
            <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
            <span className="text-[11.5px] text-ink-muted leading-relaxed">
              {t('login.agentsOnlyNotice', {
                defaultValue: 'Non-agent accounts will be signed out automatically. This portal is for the support team only.',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Mobile footer ────────────────────────────────────── */}
      <div className="relative md:hidden text-center py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-[11px] text-ink-subtle">© 2026 Wash · Support</p>
      </div>
    </div>
  )
}
