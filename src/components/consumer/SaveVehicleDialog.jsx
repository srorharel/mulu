import { useState, useEffect } from 'react'
import { Loader2, Car } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../ui/Toast.jsx'
import Modal, { modalBtn } from '../ui/Modal.jsx'
import { formatPlate } from '../../lib/formatPlate.js'

// Shown post-booking when the consumer booked with a free-text plate.
// onSaved(vehicle) — called after INSERT succeeds; caller navigates away.
// onDismiss()      — called when skipped; caller navigates away.
export default function SaveVehicleDialog({ open, plateData, consumerId, onSaved, onDismiss }) {
  const { t } = useTranslation()
  const showToast = useToast()
  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && plateData?.plate) setNickname(formatPlate(plateData.plate))
    if (!open) { setNickname(''); setSaving(false) }
  }, [open, plateData?.plate])

  async function handleSave() {
    if (!nickname.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        consumer_id: consumerId,
        plate:       plateData.plate,
        nickname:    nickname.trim(),
        make:        plateData.make,
        model:       plateData.model,
        year:        plateData.year,
        color:       plateData.color,
        category:    plateData.category,
      })
      .select('*')
      .single()
    setSaving(false)
    if (error) { showToast(t('common.error'), 'error'); return }
    onSaved(data)
  }

  return (
    <Modal
      open={open}
      onClose={onDismiss}
      icon={Car}
      tone="brand"
      title={t('consumer.home.saveVehicle.title')}
    >
      <div className="flex flex-col gap-1.5">
        <label className="label">{t('consumer.home.saveVehicle.nicknameLabel')}</label>
        <input
          className="input"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && nickname.trim()) handleSave() }}
          placeholder={t('consumer.home.saveVehicle.nicknamePlaceholder')}
          maxLength={40}
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          onClick={handleSave}
          disabled={saving || !nickname.trim()}
          className={modalBtn.primary}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('consumer.home.saveVehicle.save')}
        </button>
        <button onClick={onDismiss} className={modalBtn.neutral}>
          {t('consumer.home.saveVehicle.skip')}
        </button>
      </div>
    </Modal>
  )
}
