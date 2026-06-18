import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Star, Car } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { formatPlate } from '../../lib/formatPlate.js'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'
import IsraeliPlate from '../../components/ui/IsraeliPlate.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import AddVehicleSheet from '../../components/consumer/AddVehicleSheet.jsx'

export default function Vehicles() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const showToast = useToast()

  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editingValue, setEditingValue] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [addSheetOpen, setAddSheetOpen] = useState(false)

  const fetchVehicles = useCallback(async () => {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
    setVehicles(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchVehicles() }, [fetchVehicles])

  function startEdit(v) {
    setEditingId(v.id)
    setEditingValue(v.nickname)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingValue('')
  }

  async function saveNickname() {
    if (!editingValue.trim() || !editingId) return
    setSavingNickname(true)
    const trimmed = editingValue.trim()
    const { error } = await supabase
      .from('vehicles')
      .update({ nickname: trimmed })
      .eq('id', editingId)
    setSavingNickname(false)
    if (error) { showToast(t('common.error'), 'error'); return }
    setVehicles(vs => vs.map(v => v.id === editingId ? { ...v, nickname: trimmed } : v))
    cancelEdit()
    showToast(t('consumer.vehicles.nicknameSaved'), 'success')
  }

  async function confirmDelete() {
    const id = pendingDeleteId
    setPendingDeleteId(null)
    const { error } = await supabase.from('vehicles').delete().eq('id', id)
    if (error) { showToast(t('common.error'), 'error'); return }
    setVehicles(vs => vs.filter(v => v.id !== id))
    showToast(t('consumer.vehicles.deleted'), 'success')
  }

  async function setDefault(vehicleId) {
    const { error } = await supabase.rpc('set_default_vehicle', { p_vehicle_id: vehicleId })
    if (error) { showToast(t('common.error'), 'error'); return }
    setVehicles(vs => vs.map(v => ({ ...v, is_default: v.id === vehicleId })))
    showToast(t('consumer.vehicles.defaultSet'), 'success')
  }

  function handleAdded(newVehicle) {
    setAddSheetOpen(false)
    setVehicles(vs => {
      const base = newVehicle.is_default ? vs.map(v => ({ ...v, is_default: false })) : vs
      return [...base, newVehicle].sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1
        return new Date(a.created_at) - new Date(b.created_at)
      })
    })
    showToast(t('consumer.vehicles.saved'), 'success')
  }

  return (
    <PageShell>
      <div className="bg-mesh min-h-full flex flex-col">

        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center gap-3 shrink-0">
          <MotionButton
            onClick={() => navigate('/profile')}
            className="rounded-[14px] w-[38px] h-[38px] flex items-center justify-center bg-white/60 border border-glass-border backdrop-blur-sm text-ink-muted hover:text-ink shrink-0"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </MotionButton>
          <h1 className="text-[22px] font-extrabold text-ink tracking-[-0.5px]">
            {t('consumer.vehicles.title')}
          </h1>
        </div>

        <div className="flex-1 px-4 flex flex-col gap-3 pb-4">

          {loading ? (
            <GlassCard className="p-4 flex flex-col gap-3">
              <div className="h-[80px] rounded-xl bg-neutral-100/80 dark:bg-surface-elevated animate-pulse" />
              <div className="h-[80px] rounded-xl bg-neutral-100/80 dark:bg-surface-elevated animate-pulse" />
            </GlassCard>
          ) : vehicles.length === 0 ? (
            <GlassCard className="p-8 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-[18px] bg-primary-50 dark:bg-accent-muted flex items-center justify-center">
                <Car className="h-7 w-7 text-primary-600" />
              </div>
              <p className="text-[15px] font-bold text-ink">{t('consumer.vehicles.noVehicles')}</p>
              <p className="text-[13px] text-ink-muted leading-snug max-w-[220px]">
                {t('consumer.vehicles.noVehiclesHint')}
              </p>
            </GlassCard>
          ) : (
            <GlassCard className="p-0 overflow-hidden">
              {vehicles.map((v, idx) => (
                <div key={v.id}>
                  {idx > 0 && <div className="h-px bg-glass-border mx-4" />}
                  <VehicleRow
                    vehicle={v}
                    isEditing={editingId === v.id}
                    editingValue={editingValue}
                    savingNickname={savingNickname}
                    onEditingValueChange={setEditingValue}
                    onStartEdit={startEdit}
                    onSaveNickname={saveNickname}
                    onCancelEdit={cancelEdit}
                    onDelete={() => setPendingDeleteId(v.id)}
                    onSetDefault={() => setDefault(v.id)}
                    t={t}
                  />
                </div>
              ))}
            </GlassCard>
          )}

          {/* Add vehicle CTA */}
          <MotionButton
            onClick={() => setAddSheetOpen(true)}
            className="btn-outline w-full flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {t('consumer.vehicles.addVehicle')}
          </MotionButton>

        </div>
      </div>

      <AddVehicleSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onAdded={handleAdded}
        consumerId={user.id}
      />

      <ConfirmDialog
        open={!!pendingDeleteId}
        title={t('consumer.vehicles.deleteConfirm.title')}
        message={t('consumer.vehicles.deleteConfirm.message')}
        confirmLabel={t('consumer.vehicles.deleteConfirm.confirm')}
        cancelLabel={t('consumer.vehicles.deleteConfirm.cancel')}
        destructive
        icon={Trash2}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </PageShell>
  )
}

function VehicleRow({
  vehicle: v,
  isEditing,
  editingValue,
  savingNickname,
  onEditingValueChange,
  onStartEdit,
  onSaveNickname,
  onCancelEdit,
  onDelete,
  onSetDefault,
  t,
}) {
  return (
    <div className="p-4 flex flex-col gap-2.5">

      {/* Plate + nickname/input */}
      <div className="flex items-center gap-3" dir="ltr">
        <IsraeliPlate number={formatPlate(v.plate)} />

        <div className="flex-1 min-w-0" dir="auto">
          {isEditing ? (
            <input
              className="input text-sm py-2"
              style={{ minHeight: 'unset', height: 36 }}
              value={editingValue}
              onChange={e => onEditingValueChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onSaveNickname()
                if (e.key === 'Escape') onCancelEdit()
              }}
              maxLength={40}
              autoFocus
            />
          ) : (
            <p className="text-[15px] font-semibold text-ink truncate leading-snug">{v.nickname}</p>
          )}
          {(v.make || v.model) && !isEditing && (
            <p className="text-[12px] text-ink-muted truncate mt-0.5">
              {[v.make, v.model, v.year].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {v.is_default && !isEditing && (
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-primary-50 dark:bg-accent-muted border border-primary-200 text-[10px] font-semibold text-primary-700 uppercase tracking-wide">
            {t('consumer.vehicles.defaultBadge')}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        {isEditing ? (
          <>
            <MotionButton
              onClick={onSaveNickname}
              disabled={savingNickname || !editingValue.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-500 text-white text-[13px] font-semibold disabled:opacity-50 h-[36px]"
            >
              <Check className="h-3.5 w-3.5" />
              {t('common.save')}
            </MotionButton>
            <MotionButton
              onClick={onCancelEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-edge text-ink-muted text-[13px] font-semibold h-[36px]"
            >
              <X className="h-3.5 w-3.5" />
              {t('common.cancel')}
            </MotionButton>
          </>
        ) : (
          <>
            {!v.is_default && (
              <MotionButton
                onClick={onSetDefault}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-edge text-ink-muted hover:text-primary-700 hover:border-primary-300 text-[13px] font-medium transition-colors h-[36px]"
              >
                <Star className="h-3.5 w-3.5" />
                {t('consumer.vehicles.setDefault')}
              </MotionButton>
            )}
            <MotionButton
              onClick={() => onStartEdit(v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-edge text-ink-muted hover:text-ink text-[13px] font-medium transition-colors h-[36px]"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('consumer.vehicles.editNickname')}
            </MotionButton>
            <MotionButton
              onClick={onDelete}
              className="ms-auto flex items-center px-3 py-1.5 rounded-xl text-danger-500 hover:bg-danger-50 text-[13px] transition-colors h-[36px]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </MotionButton>
          </>
        )}
      </div>
    </div>
  )
}
