import { supabase } from './supabase.js'

// Agent-facing content-report queries. RLS lets agents read + update all rows.

export function fetchReports() {
  return supabase
    .from('content_reports')
    .select('id, reporter_id, reported_user_id, context, order_id, message_id, reason, status, created_at')
    .order('created_at', { ascending: false })
}

export function setReportStatus(id, status) {
  return supabase.from('content_reports').update({ status }).eq('id', id)
}

export function countOpenReports() {
  return supabase.from('content_reports').select('*', { count: 'exact', head: true }).eq('status', 'open')
}
