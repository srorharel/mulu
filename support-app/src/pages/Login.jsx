import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { t } = useTranslation()
  const { signIn, agentBlocked } = useAuth()
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-ink">Wash Support</h1>
          <p className="text-sm text-ink-muted mt-1">{t('login.subtitle')}</p>
        </div>

        {agentBlocked && (
          <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-danger-500">
            {t('login.agentsOnly')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">{t('login.email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="input"
              placeholder="agent@wash.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">{t('login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="input"
            />
          </div>

          {error && (
            <p className="text-danger-500 text-sm">{error}</p>
          )}

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
