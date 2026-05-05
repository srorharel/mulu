import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogOut, User } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import PageShell from '../components/ui/PageShell.jsx'

const schema = z.object({
  full_name:       z.string().min(2, 'Name must be at least 2 characters'),
  phone:           z.string().min(9, 'Enter a valid phone number').or(z.literal('')),
  equipment_notes: z.string().optional(),
})

export default function Profile() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const showToast = useToast()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name:       profile?.full_name       ?? '',
      phone:           profile?.phone           ?? '',
      equipment_notes: profile?.equipment_notes ?? '',
    },
  })

  async function onSubmit(data) {
    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', user.id)

    if (error) { showToast(error.message, 'error'); return }
    await refreshProfile()
    showToast('Profile updated', 'success')
  }

  const isWasher = profile?.role === 'washer'

  return (
    <div dir={isWasher ? 'rtl' : 'ltr'} className={isWasher ? 'dark h-full' : 'h-full'}>
      <PageShell>
        <div className="px-5 pt-10 pb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="rounded-full bg-primary-100 dark:bg-accent-muted p-3">
              <User className="h-6 w-6 text-primary-600 dark:text-accent" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{profile?.full_name ?? 'Your profile'}</h1>
              <span className="text-xs font-medium uppercase tracking-wide text-primary-600 dark:text-accent bg-primary-50 dark:bg-accent-muted rounded px-2 py-0.5">
                {profile?.role}
              </span>
            </div>
          </div>

          <div className="mb-4">
            <p className="label">Email</p>
            <p className="input bg-neutral-50 dark:bg-surface text-neutral-500 dark:text-ink-muted flex items-center truncate">{user?.email}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div>
              <label className="label">Full name</label>
              <input className="input" {...register('full_name')} />
              {errors.full_name && <p className="field-error">{errors.full_name.message}</p>}
            </div>

            <div>
              <label className="label">Phone</label>
              <input className="input" type="tel" placeholder="050-0000000" {...register('phone')} />
              {errors.phone && <p className="field-error">{errors.phone.message}</p>}
            </div>

            {profile?.role === 'washer' && (
              <div>
                <label className="label">Equipment notes</label>
                <textarea
                  className="input min-h-[80px] resize-none"
                  placeholder="e.g. pressure washer, foam cannon, microfibre cloths"
                  {...register('equipment_notes')}
                />
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </form>

          <button onClick={signOut} className="btn-ghost w-full mt-6 text-danger-500 hover:bg-danger-50">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </PageShell>
    </div>
  )
}
