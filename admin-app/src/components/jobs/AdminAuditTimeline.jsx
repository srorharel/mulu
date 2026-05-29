import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { fetchAdminAudit } from '../../lib/adminJobs.js'
import { supabase } from '../../lib/supabase.js'
import { relativeTime } from '../../lib/relativeTime.js'

const ACTION_LABEL = {
  force_status:        'Forced status',
  reassign_washer:     'Reassigned washer',
  override_price:      'Overrode price',
  replace_photo:       'Replaced photo',
  admin_create_order:  'Created order',
  cancel:              'Cancelled (admin)',
  force_complete:      'Force-completed',
}

export default function AdminAuditTimeline({ orderId }) {
  const [rows, setRows] = useState([])

  async function load() {
    try { setRows(await fetchAdminAudit(orderId)) } catch { /* empty */ }
  }

  useEffect(() => { load() }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ch = supabase
      .channel(`admin-audit-${orderId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_order_audit', filter: `order_id=eq.${orderId}` },
        load
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="card">
      <h3 className="font-semibold text-ink mb-2 flex items-center gap-2">
        <ShieldCheck size={14} className="text-admin-deep" /> Admin overrides
        <span className="ms-auto text-[11px] text-ink-muted tabular-nums">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No admin actions on this order.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-edge text-[12px]">
          {rows.map(r => (
            <li key={r.id} className="py-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-admin-soft text-admin-deep">
                  {ACTION_LABEL[r.action] ?? r.action}
                </span>
                <span className="text-ink-subtle">{r.admin?.full_name || 'admin'}</span>
                <span className="ms-auto text-ink-subtle text-[10.5px]">{relativeTime(r.created_at)}</span>
              </div>
              {r.reason && (
                <p className="mt-1 text-ink-muted whitespace-pre-wrap break-words">{r.reason}</p>
              )}
              {r.payload && Object.keys(r.payload).length > 0 && (
                <pre className="mt-1 text-[10.5px] text-ink-subtle bg-surface rounded-lg px-2 py-1 overflow-x-auto">{JSON.stringify(r.payload, null, 2)}</pre>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
