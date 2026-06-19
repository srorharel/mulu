import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, Loader2, Lock, Eye, EyeOff } from 'lucide-react'
import { auth } from '../lib/content.js'
import { Wordmark } from '../components/brand.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

// verifyOtp types we route through this page. These are all server-side-state
// confirmations (email confirmed / password changed) that take effect regardless
// of which origin verifies them — so doing it here on muluwash.com is correct.
// magic_link / invite are intentionally NOT here: they exist to create a session
// IN THE APP, which verifying on this origin cannot do.
const ALLOWED = new Set(['signup', 'recovery', 'email_change'])

function readParams() {
  const q = new URLSearchParams(window.location.search)
  const hash = window.location.hash.startsWith('#')
    ? new URLSearchParams(window.location.hash.slice(1))
    : new URLSearchParams()
  return {
    tokenHash: q.get('token_hash') || hash.get('token_hash'),
    type: q.get('type') || hash.get('type'),
  }
}

function IconBadge({ tone, children }) {
  const tones = {
    success: 'bg-primary/15 text-primary-deep',
    error: 'bg-shine/15 text-shine',
    neutral: 'bg-mist text-primary-deep',
  }
  return (
    <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${tones[tone]}`}>
      {children}
    </span>
  )
}

function Result({ tone, icon, title, body }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <IconBadge tone={tone}>{icon}</IconBadge>
      <h1 className="text-2xl font-extrabold text-ink">{title}</h1>
      <p className="leading-relaxed text-ink-soft">{body}</p>
    </div>
  )
}

function ResetForm({ onDone }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (pw.length < 8) { setError(auth.reset.tooShort); return }
    if (pw !== confirm) { setError(auth.reset.mismatch); return }
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password: pw })
    if (err) {
      setSaving(false)
      setError(auth.reset.failed)
      return
    }
    // Don't leave the recovery session lingering on the marketing origin.
    try { await supabase.auth.signOut() } catch { /* noop */ }
    onDone()
  }

  const field =
    'w-full rounded-2xl border border-line bg-wash px-4 py-3 pe-11 text-ink outline-none transition-colors focus:border-primary'

  return (
    <div className="flex flex-col gap-5 text-center">
      <div className="flex flex-col items-center gap-3">
        <IconBadge tone="neutral"><Lock className="h-7 w-7" strokeWidth={2.2} aria-hidden="true" /></IconBadge>
        <h1 className="text-2xl font-extrabold text-ink">{auth.reset.title}</h1>
        <p className="leading-relaxed text-ink-soft">{auth.reset.body}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 text-right">
        <div className="relative">
          <label htmlFor="new-password" className="sr-only">{auth.reset.password}</label>
          <input
            id="new-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={auth.reset.password}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className={field}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? auth.reset.hide : auth.reset.show}
            className="absolute inset-y-0 end-3 flex items-center text-ink-mute hover:text-ink"
          >
            {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>

        <div className="relative">
          <label htmlFor="confirm-password" className="sr-only">{auth.reset.confirm}</label>
          <input
            id="confirm-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={auth.reset.confirm}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={field}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm font-semibold text-shine">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-base font-bold text-white shadow-glow transition-all duration-200 hover:bg-primary-deep hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 min-h-[52px]"
        >
          {saving && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
          {saving ? auth.reset.saving : auth.reset.submit}
        </button>
      </form>
    </div>
  )
}

export function AuthConfirm() {
  // 'verifying' | 'success' | 'email_change' | 'reset' | 'done' | 'invalid' | 'config'
  const [status, setStatus] = useState('verifying')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // verifyOtp is single-use — guard StrictMode's double invoke
    ran.current = true

    if (!isSupabaseConfigured || !supabase) { setStatus('config'); return }

    const { tokenHash, type } = readParams()
    // Scrub the token from the URL + history immediately (keep it out of
    // referrer headers and the back-button history).
    try { window.history.replaceState({}, '', window.location.pathname) } catch { /* noop */ }

    if (!tokenHash || !type || !ALLOWED.has(type)) { setStatus('invalid'); return }

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type })
      .then(({ error }) => {
        if (error) { setStatus('invalid'); return }
        if (type === 'recovery') setStatus('reset')
        else if (type === 'email_change') setStatus('email_change')
        else setStatus('success')
      })
      .catch(() => setStatus('invalid'))
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-aurora px-4 py-12">
      <a href="/" className="mb-8 flex items-center gap-2" aria-label={auth.backHome}>
        <img src="/logo.png" alt="" className="h-11 w-11 rounded-xl shadow-soft" width="44" height="44" />
        <Wordmark className="text-2xl" />
      </a>

      <div
        className="w-full max-w-md rounded-[2rem] bg-white p-8 text-center shadow-lift"
        aria-live="polite"
        aria-busy={status === 'verifying'}
      >
        {status === 'verifying' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
            <p className="font-semibold text-ink-soft">{auth.verifying}</p>
          </div>
        )}

        {status === 'success' && (
          <Result tone="success" icon={<CheckCircle2 className="h-9 w-9" strokeWidth={2.2} aria-hidden="true" />} title={auth.signup.title} body={auth.signup.body} />
        )}
        {status === 'email_change' && (
          <Result tone="success" icon={<CheckCircle2 className="h-9 w-9" strokeWidth={2.2} aria-hidden="true" />} title={auth.email_change.title} body={auth.email_change.body} />
        )}
        {status === 'done' && (
          <Result tone="success" icon={<CheckCircle2 className="h-9 w-9" strokeWidth={2.2} aria-hidden="true" />} title={auth.recoveryDone.title} body={auth.recoveryDone.body} />
        )}
        {status === 'reset' && <ResetForm onDone={() => setStatus('done')} />}
        {status === 'invalid' && (
          <Result tone="error" icon={<AlertTriangle className="h-9 w-9" strokeWidth={2.2} aria-hidden="true" />} title={auth.invalid.title} body={auth.invalid.body} />
        )}
        {status === 'config' && (
          <Result tone="error" icon={<AlertTriangle className="h-9 w-9" strokeWidth={2.2} aria-hidden="true" />} title={auth.configError.title} body={auth.configError.body} />
        )}
      </div>

      <a href="/" className="mt-6 text-sm font-semibold text-ink-mute transition-colors hover:text-primary-deep">
        {auth.backHome}
      </a>
    </div>
  )
}
