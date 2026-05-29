import { useEffect, useState } from 'react'
import { X, AlertCircle, ShieldCheck, KeyRound, Ban, Unlock, UserCog, GitMerge, ExternalLink, Trash2 } from 'lucide-react'
import {
  fetchUserDetail, fetchUserAuth, fetchUserActivity, fetchAdminUserAudit,
  fetchConsumerSummary, fetchWasherSummary, fetchAgentSummary,
  adminUpdateProfile, adminUnsuspend, adminResetPassword, adminDeleteUser,
  roleColor, EDITABLE_PROFILE_FIELDS,
} from '../../lib/adminUsers.js'
import { supabase } from '../../lib/supabase.js'
import { relativeTime } from '../../lib/relativeTime.js'
import SuspendDialog from './SuspendDialog.jsx'
import MergeWizard from './MergeWizard.jsx'
import ImpersonateLauncher from './ImpersonateLauncher.jsx'
import ConfirmDialog from '../ConfirmDialog.jsx'

export default function UserDetail({ userId, onClose, onChanged }) {
  const [profile, setProfile]   = useState(null)
  const [auth, setAuth]         = useState(null)
  const [activity, setActivity] = useState([])
  const [audit, setAudit]       = useState([])
  const [summary, setSummary]   = useState(null)
  const [error, setError]       = useState(null)
  const [editing, setEditing]   = useState(false)
  const [showSuspend, setSuspend]       = useState(false)
  const [showMerge, setMerge]           = useState(false)
  const [showImpersonate, setImper]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReset, setConfirmReset]   = useState(false)
  const [busy, setBusy] = useState(false)
  const [tempPassword, setTempPassword] = useState(null)

  async function load() {
    setError(null)
    try {
      const p = await fetchUserDetail(userId)
      setProfile(p)
      const [a, act, aud] = await Promise.all([
        fetchUserAuth(userId).catch(() => null),
        fetchUserActivity(userId).catch(() => []),
        fetchAdminUserAudit(userId).catch(() => []),
      ])
      setAuth(a); setActivity(act); setAudit(aud)
      // Role-specific summary
      let s = null
      if (p.role === 'consumer') s = await fetchConsumerSummary(userId).catch(() => null)
      if (p.role === 'washer')   s = await fetchWasherSummary(userId).catch(() => null)
      if (p.role === 'agent')    s = await fetchAgentSummary(userId).catch(() => null)
      setSummary(s)
    } catch (e) { setError(e.message) }
  }

  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ch = supabase
      .channel(`user-detail-${userId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        load
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doUnsuspend() {
    setBusy(true); setError(null)
    try { await adminUnsuspend(userId); await load(); onChanged?.() }
    catch (e) { setError(e.message) }
    finally   { setBusy(false) }
  }

  async function doResetPassword() {
    setBusy(true); setError(null)
    try {
      const res = await adminResetPassword(userId)
      setTempPassword(res.temporary_password)
      await load()
    } catch (e) { setError(e.message) }
    finally    { setBusy(false); setConfirmReset(false) }
  }

  async function doDelete() {
    setBusy(true); setError(null)
    try { await adminDeleteUser(userId); onClose?.(); onChanged?.() }
    catch (e) { setError(e.message) }
    finally    { setBusy(false); setConfirmDelete(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={onClose}>
      <aside
        className="w-full max-w-3xl h-full bg-surface shadow-2xl border-l border-edge overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 bg-surface-elevated border-b border-edge px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-ink-subtle">User</p>
            <p className="font-mono text-[13px] text-ink truncate">{userId}</p>
          </div>
          {profile && (
            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${roleColor(profile.role)}`}>
              {profile.role}
            </span>
          )}
          <button onClick={onClose} className="text-ink-muted hover:text-ink p-1.5">
            <X size={16} />
          </button>
        </header>

        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
          </div>
        )}
        {!profile && !error && (
          <div className="p-8 text-center text-ink-muted text-sm">Loading…</div>
        )}

        {profile && (
          <div className="p-5 flex flex-col gap-5">
            {profile.suspended_at && (
              <div className="card border-danger/30 bg-danger/5">
                <p className="text-[11px] uppercase tracking-wider text-danger font-bold">Suspended</p>
                <p className="text-[12.5px] text-ink mt-1">{profile.suspended_reason || '—'}</p>
                <p className="text-[10.5px] text-ink-subtle mt-0.5">Since {relativeTime(profile.suspended_at)}</p>
                <button className="btn-ghost text-xs mt-2" onClick={doUnsuspend} disabled={busy}>
                  <Unlock size={12} /> Unsuspend
                </button>
              </div>
            )}

            {/* Quick-action bar */}
            <div className="card flex flex-wrap gap-2">
              <ActionBtn onClick={() => setEditing(true)}   icon={UserCog}   label="Edit profile" />
              <ActionBtn onClick={() => setSuspend(true)}   icon={Ban}       label="Suspend" danger
                disabled={!!profile.suspended_at || profile.role === 'super_admin'} />
              <ActionBtn onClick={() => setConfirmReset(true)} icon={KeyRound} label="Reset password"
                disabled={profile.role === 'super_admin'} />
              <ActionBtn onClick={() => setImper(true)}     icon={ExternalLink} label="Impersonate"
                disabled={profile.role === 'super_admin'} />
              <ActionBtn onClick={() => setMerge(true)}     icon={GitMerge}  label="Merge into…" />
              <ActionBtn onClick={() => setConfirmDelete(true)} icon={Trash2} label="Delete" danger
                disabled={profile.role === 'super_admin'} />
            </div>

            {tempPassword && (
              <div className="card border-warning/30 bg-warning/5">
                <p className="text-[11px] uppercase tracking-wider text-warning font-bold">One-time password — copy now</p>
                <p className="font-mono text-sm text-ink mt-1 select-all">{tempPassword}</p>
                <button className="text-[11px] text-ink-subtle hover:text-ink mt-1" onClick={() => setTempPassword(null)}>Clear from view</button>
              </div>
            )}

            <SummaryGrid profile={profile} auth={auth} />

            {editing && (
              <EditProfileSection profile={profile}
                onCancel={() => setEditing(false)}
                onSaved={() => { setEditing(false); load(); onChanged?.() }}
              />
            )}

            {profile.role === 'consumer' && summary && <ConsumerRoleSection s={summary} />}
            {profile.role === 'washer'   && summary && <WasherRoleSection   s={summary} />}
            {profile.role === 'agent'    && summary && <AgentRoleSection    s={summary} />}

            <ActivitySection rows={activity} />
            <AdminAuditSection rows={audit} />
          </div>
        )}
      </aside>

      {showSuspend && (
        <SuspendDialog userId={userId} onClose={() => setSuspend(false)} onDone={() => { setSuspend(false); load(); onChanged?.() }} />
      )}
      {showMerge && (
        <MergeWizard keepUserId={userId} onClose={() => setMerge(false)} onDone={() => { setMerge(false); onClose(); onChanged?.() }} />
      )}
      {showImpersonate && (
        <ImpersonateLauncher userId={userId} onClose={() => setImper(false)} />
      )}
      <ConfirmDialog
        open={confirmReset}
        title="Reset password?"
        message="Generates a new random password and returns it once. The user can change it after their next sign-in."
        confirmLabel="Reset"
        busy={busy}
        onCancel={() => setConfirmReset(false)}
        onConfirm={doResetPassword}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this account?"
        message="Permanently removes the profile, auth user, and all rows. Cannot be undone. Active orders block deletion."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
    </div>
  )
}

function ActionBtn({ icon: Icon, label, danger, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? 'btn border border-danger/50 text-danger hover:bg-danger/10 disabled:opacity-50 text-sm'
          : 'btn border border-edge text-ink hover:bg-surface-elevated-2 disabled:opacity-50 text-sm'
      }
    >
      <Icon size={14} /> {label}
    </button>
  )
}

function SummaryGrid({ profile, auth }) {
  return (
    <section className="grid grid-cols-2 gap-3">
      <InfoCard title="Profile">
        <p className="text-sm font-semibold text-ink">{profile.full_name || '—'}</p>
        <p className="text-[12px] text-ink-muted">{profile.phone || '—'}</p>
        <p className="text-[11px] text-ink-subtle">locale: {profile.locale || '—'} · theme: {profile.display_preference || '—'}</p>
      </InfoCard>
      <InfoCard title="Auth (auth.users)">
        <p className="text-sm text-ink">{auth?.email || '—'}</p>
        <p className="text-[11px] text-ink-subtle">last sign-in: {auth?.last_sign_in_at ? relativeTime(auth.last_sign_in_at) : '—'}</p>
        <p className="text-[11px] text-ink-subtle">confirmed: {auth?.email_confirmed_at ? 'yes' : 'no'}</p>
      </InfoCard>
      {profile.role === 'washer' && (
        <InfoCard title="Washer">
          <p className="text-[12px] text-ink-muted">tier: {profile.current_tier ?? '—'} · ⭐ {profile.current_rating ?? '—'} ({profile.rated_job_count ?? 0} rated)</p>
          <p className="text-[11px] text-ink-subtle">verification: {profile.washer_verification_status ?? '—'}</p>
          <p className="text-[11px] text-ink-subtle">online: {profile.is_online ? 'yes' : 'no'}</p>
        </InfoCard>
      )}
      {profile.role === 'agent' && (
        <InfoCard title="Agent">
          <p className="text-[12px] text-ink-muted">display name: {profile.agent_display_name || '—'}</p>
          <p className="text-[11px] text-ink-subtle">active: {profile.agent_is_active ? 'yes' : 'no'}</p>
        </InfoCard>
      )}
    </section>
  )
}

function InfoCard({ title, children }) {
  return (
    <div className="card">
      <p className="text-[10.5px] uppercase tracking-wider text-ink-subtle mb-1">{title}</p>
      {children}
    </div>
  )
}

function EditProfileSection({ profile, onCancel, onSaved }) {
  const initial = {}
  for (const k of EDITABLE_PROFILE_FIELDS) initial[k] = profile[k] ?? ''
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState(null)

  async function doSave() {
    setBusy(true); setErr(null)
    try {
      const changes = {}
      for (const k of EDITABLE_PROFILE_FIELDS) {
        const v = draft[k]
        if (v === '' || v === null) continue
        if (k === 'agent_is_active') changes[k] = v === 'true' || v === true
        else if (k === 'current_tier') changes[k] = Number(v)
        else changes[k] = v
      }
      await adminUpdateProfile(profile.id, changes)
      onSaved?.()
    } catch (e) { setErr(e.message) }
    finally    { setBusy(false) }
  }

  return (
    <section className="card flex flex-col gap-3">
      <h3 className="font-semibold text-ink flex items-center gap-2"><UserCog size={14} /> Edit profile</h3>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Full name" value={draft.full_name} onChange={v => setDraft({ ...draft, full_name: v })} />
        <Field label="Phone"     value={draft.phone}     onChange={v => setDraft({ ...draft, phone: v })} />
        <SelectField label="Locale" value={draft.locale} onChange={v => setDraft({ ...draft, locale: v })}
          options={['', 'en', 'he']} />
        <SelectField label="Role" value={draft.role} onChange={v => setDraft({ ...draft, role: v })}
          options={['', 'consumer', 'washer', 'agent', 'super_admin']} />
        <SelectField label="Washer verification" value={draft.washer_verification_status} onChange={v => setDraft({ ...draft, washer_verification_status: v })}
          options={['', 'pending_review', 'approved', 'rejected']} />
        <Field label="Agent display name" value={draft.agent_display_name} onChange={v => setDraft({ ...draft, agent_display_name: v })} />
        <SelectField label="Agent active" value={String(draft.agent_is_active ?? '')} onChange={v => setDraft({ ...draft, agent_is_active: v })}
          options={['', 'true', 'false']} />
        <Field label="Current tier (1–5)" type="number" value={draft.current_tier} onChange={v => setDraft({ ...draft, current_tier: v })} />
      </div>
      {err && <p className="text-xs text-danger font-mono">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={doSave} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </section>
  )
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-uppercase">{label}</span>
      <input type={type} className="input" value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </label>
  )
}
function SelectField({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-uppercase">{label}</span>
      <select className="input" value={value ?? ''} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o || '— unchanged —'}</option>)}
      </select>
    </label>
  )
}

function ConsumerRoleSection({ s }) {
  return (
    <section className="card">
      <h3 className="font-semibold text-ink mb-2">Consumer summary</h3>
      <p className="text-[12px] text-ink-muted mb-1">Vehicles ({s.vehicles.length})</p>
      <ul className="text-[12px] text-ink-muted mb-3 space-y-0.5">
        {s.vehicles.map(v => (
          <li key={v.id}><span className="font-mono text-ink">{v.plate}</span> · {v.nickname || '—'} · {v.category}{v.is_default ? ' · default' : ''}</li>
        ))}
        {s.vehicles.length === 0 && <li className="text-ink-subtle italic">none</li>}
      </ul>
      <p className="text-[12px] text-ink-muted mb-1">Recent orders ({s.orders.length})</p>
      <ul className="text-[11.5px] text-ink-muted space-y-0.5 max-h-[200px] overflow-y-auto">
        {s.orders.map(o => (
          <li key={o.id}>{relativeTime(o.created_at)} · {o.status} · ₪{Number(o.total_price)} · {o.car_type}</li>
        ))}
      </ul>
    </section>
  )
}

function WasherRoleSection({ s }) {
  return (
    <section className="card">
      <h3 className="font-semibold text-ink mb-2">Washer summary</h3>
      <p className="text-[12px] text-ink-muted mb-1">Recent ratings ({s.ratings.length})</p>
      <ul className="text-[11.5px] text-ink-muted space-y-0.5 max-h-[160px] overflow-y-auto mb-3">
        {s.ratings.map(r => (
          <li key={r.id}>{relativeTime(r.created_at)} · {r.stars}★ {r.feedback ? `· ${r.feedback}` : ''}</li>
        ))}
      </ul>
      <p className="text-[12px] text-ink-muted mb-1">Recent orders ({s.orders.length})</p>
      <ul className="text-[11.5px] text-ink-muted space-y-0.5 max-h-[200px] overflow-y-auto">
        {s.orders.map(o => (
          <li key={o.id}>{o.status} · ₪{Number(o.payout_amount ?? 0)} · {o.car_type}{o.approved_at ? ` · ${relativeTime(o.approved_at)}` : ''}</li>
        ))}
      </ul>
      {s.verifications.length > 0 && (
        <>
          <p className="text-[12px] text-ink-muted mt-3 mb-1">Verification submissions ({s.verifications.length})</p>
          <ul className="text-[11.5px] text-ink-muted space-y-0.5">
            {s.verifications.map(v => (
              <li key={v.id}>{relativeTime(v.created_at)} · {v.status}{v.reason ? ` · ${v.reason}` : ''}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function AgentRoleSection({ s }) {
  return (
    <section className="card">
      <h3 className="font-semibold text-ink mb-2">Agent summary</h3>
      <p className="text-[12px] text-ink-muted mb-1">Conversations claimed ({s.conversations.length})</p>
      <ul className="text-[11.5px] text-ink-muted space-y-0.5 max-h-[200px] overflow-y-auto mb-3">
        {s.conversations.map(c => (
          <li key={c.id}>{relativeTime(c.created_at)} · {c.status} · {(c.last_message_body || '').slice(0, 60)}</li>
        ))}
      </ul>
      <p className="text-[12px] text-ink-muted">{s.canned.length} canned response(s)</p>
    </section>
  )
}

function ActivitySection({ rows }) {
  return (
    <section className="card">
      <h3 className="font-semibold text-ink mb-2">Activity feed</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No activity.</p>
      ) : (
        <ol className="text-[11.5px] text-ink-muted space-y-0.5 max-h-[240px] overflow-y-auto">
          {rows.map((r, i) => (
            <li key={i}>
              <span className="text-ink-subtle tabular-nums">{new Date(r.occurred_at).toLocaleString()}</span>
              <span className="ms-2 text-[10px] uppercase tracking-wider text-admin-deep">{r.source}</span>
              <span className="ms-2">{r.summary}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function AdminAuditSection({ rows }) {
  return (
    <section className="card">
      <h3 className="font-semibold text-ink mb-2 flex items-center gap-2">
        <ShieldCheck size={14} className="text-admin-deep" /> Admin audit ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No admin actions on this user.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-edge text-[12px]">
          {rows.map(r => (
            <li key={r.id} className="py-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-admin-soft text-admin-deep">{r.action}</span>
                <span className="text-ink-subtle">{r.admin?.full_name || 'admin'}</span>
                <span className="ms-auto text-ink-subtle text-[10.5px]">{relativeTime(r.created_at)}</span>
              </div>
              {r.reason && <p className="mt-1 text-ink-muted whitespace-pre-wrap break-words">{r.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
