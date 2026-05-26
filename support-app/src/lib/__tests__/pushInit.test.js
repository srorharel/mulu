import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}))

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    requestPermissions: vi.fn(),
    register: vi.fn(),
    addListener: vi.fn(),
  },
}))

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({}),
        })),
      })),
    })),
  },
}))

import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { registerAgentPush, unregisterAgentToken } from '../pushInit'
import { supabase } from '../supabase'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerAgentPush', () => {
  it('returns null on web (non-native)', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false)
    const result = await registerAgentPush('user-123')
    expect(result).toBeNull()
    expect(PushNotifications.requestPermissions).not.toHaveBeenCalled()
  })

  it('returns null when permission is denied', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true)
    PushNotifications.requestPermissions.mockResolvedValue({ receive: 'denied' })
    const result = await registerAgentPush('user-123')
    expect(result).toBeNull()
  })

  it('registers and saves token on permission granted', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true)
    PushNotifications.requestPermissions.mockResolvedValue({ receive: 'granted' })
    PushNotifications.register.mockResolvedValue()
    PushNotifications.addListener.mockImplementation((event, cb) => {
      if (event === 'registration') cb({ value: 'fake-token-abc' })
    })

    const result = await registerAgentPush('user-123')
    expect(result).toBe('fake-token-abc')
    expect(supabase.from).toHaveBeenCalledWith('device_tokens')
  })

  it('does not throw when upsert fails', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true)
    PushNotifications.requestPermissions.mockResolvedValue({ receive: 'granted' })
    PushNotifications.register.mockResolvedValue()

    const upsertMock = vi.fn().mockRejectedValue(new Error('db error'))
    supabase.from.mockReturnValue({ upsert: upsertMock })

    PushNotifications.addListener.mockImplementation((event, cb) => {
      if (event === 'registration') cb({ value: 'tok' })
    })

    await expect(registerAgentPush('user-123')).resolves.toBeDefined()
  })
})

describe('unregisterAgentToken', () => {
  it('is a no-op on web', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false)
    await unregisterAgentToken('user-123')
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
