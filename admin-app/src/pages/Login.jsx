import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShieldAlert, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { t } = useTranslation()
  const { signIn, blocked } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    <div className="min-h-screen flex items-center justify-center bg-surface relative overflow-hidden px-4">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: [
            'radial-gradient(at 18% 22%, rgba(232,181,71,0.18), transparent 45%)',
            'radial-gradient(at 82% 78%, rgba(232,181,71,0.08), transparent 55%)',
          ].join(','),
        }}
      />
      <div
        className="relative w-full max-w-[400px] p-7 rounded-2xl border border-edge"
        style={{
          background: 'rgba(16,19,26,0.85)',
          backdropFilter: 'blur(28px) saturate(160%)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.5)',
        }}
      >
        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-admin">
            wash / admin
          </span>
        </div>

        <h1 className="text-[22px] font-extrabold text-ink mb-1" style={{ letterSpacing: '-0.5px' }}>
          {t('login.title')}
        </h1>
        <p className="text-[12.5px] text-ink-muted mb-6">
          {t('login.subtitle')}
        </p>

        {blocked && (
          <div className="flex items-start gap-2 bg-danger/10 border border-danger/30 rounded-xl px-3 py-2.5 mb-4 text-sm text-danger">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <span>{t('login.blocked')}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label className="block text-[11px] font-semibold text-ink-muted mb-1.5 tracking-[0.03em] uppercase">
              {t('login.emailLabel')}
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="input"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-ink-muted mb-1.5 tracking-[0.03em] uppercase">
              {t('login.passwordLabel')}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="input"
            />
          </div>

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full h-11 mt-1"
          >
            {loading ? t('login.submitting') : t('login.submit')}
            {!loading && <ChevronRight size={16} strokeWidth={3} />}
          </button>
        </form>
      </div>
    </div>
  )
}
