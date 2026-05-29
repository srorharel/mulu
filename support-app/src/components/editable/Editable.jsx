// Support-app Editable wrapper. Same behavior as the main app's; uses the
// support-app's own DesignOverridesContext so the supabase client is the
// support client (separate storageKey).

import { Children, cloneElement, isValidElement, useMemo } from 'react'
import { useDesignOverride } from '../../context/DesignOverridesContext.jsx'
import { overridesToStyle } from '../../lib/designOverrides.js'
import { isDesignEditMode } from '../../lib/designEditMode.js'

export default function Editable({ id, children }) {
  const overrides = useDesignOverride(id)
  const editMode  = isDesignEditMode()
  const style     = useMemo(() => overridesToStyle(overrides), [overrides])

  const child = Children.only(children)
  if (!isValidElement(child)) return child
  const mergedStyle = { ...(child.props.style ?? {}), ...(style ?? {}) }
  const dataAttrs = editMode ? {
    'data-editable-id': id,
    onClick: (e) => {
      e.preventDefault(); e.stopPropagation()
      window.dispatchEvent(new CustomEvent('design-edit-open', { detail: { id } }))
    },
  } : {}
  const className = editMode
    ? `${child.props.className ?? ''} outline outline-2 outline-amber-400/0 hover:outline-amber-400/80 cursor-pointer`.trim()
    : child.props.className

  return cloneElement(child, { ...dataAttrs, style: mergedStyle, className })
}
