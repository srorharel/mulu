import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import i18next from 'i18next'

// Force the iOS-web code path: getUserMedia must wait for a user gesture, never
// auto-fire on mount (WebKit only reliably prompts for camera inside a gesture).
vi.mock('../lib/platform.js', () => ({
  isIOSWeb: () => true,
  isIOSStandalone: () => false,
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/camera', () => ({ Camera: { checkPermissions: vi.fn(), requestPermissions: vi.fn() } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })) } }))

import InAppCamera from '../components/shared/InAppCamera.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'camera.startCamera': 'Start camera',
    'camera.starting': 'Starting camera…',
    'camera.cancel': 'Cancel',
    'camera.capture': 'Take photo',
    'camera.hint': 'hint',
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>

let gum
beforeEach(() => {
  gum = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn(), kind: 'video' }] })
  Object.defineProperty(window.navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true })
  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', { set: vi.fn(), get: () => null, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { get: () => 4, configurable: true })
})
afterEach(() => { vi.restoreAllMocks() })

describe('InAppCamera — iOS web requires a gesture to start the camera', () => {
  it('does NOT call getUserMedia on mount; shows a Start camera button', () => {
    render(<InAppCamera onCapture={vi.fn()} onClose={vi.fn()} />, { wrapper })
    expect(gum).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeInTheDocument()
  })

  it('calls getUserMedia once the user taps Start camera', async () => {
    const user = userEvent.setup()
    render(<InAppCamera onCapture={vi.fn()} onClose={vi.fn()} />, { wrapper })
    await user.click(screen.getByRole('button', { name: 'Start camera' }))
    await waitFor(() => expect(gum).toHaveBeenCalledTimes(1))
  })
})
