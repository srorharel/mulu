import { createContext, useContext, useMemo, useState } from 'react'

// Lightweight global "download" modal state. Kept in its own file so both the
// trigger buttons (brand.jsx) and the modal (DownloadModal.jsx) can import the
// hook without a circular dependency.
const DownloadCtx = createContext({ isOpen: false, open: () => {}, close: () => {} })

export function useDownload() {
  return useContext(DownloadCtx)
}

export function DownloadProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const value = useMemo(
    () => ({ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }),
    [isOpen],
  )
  return <DownloadCtx.Provider value={value}>{children}</DownloadCtx.Provider>
}
