// src/components/editable/Editable.jsx
//
// Wrapper for any UI element whose visual properties should be reachable by
// the live design editor. Usage:
//
//   <Editable id="consumer.home.bookCta">
//     <button className="...">Book a wash</button>
//   </Editable>
//
// In normal mode: renders children unchanged but applies any overrides for
// that id as inline styles (overrides win over class-derived defaults).
//
// In edit mode (?design_edit=1 with super_admin session): adds a hover
// outline and an aria-button to open the property panel. The panel is a
// separate component in the admin/main-app pages; this file only marks the
// surface so it can be targeted.
//
// Important: Editable wraps its single child by cloning it and merging
// `style`, which means the child MUST be a single React element. A bare
// string or fragment is not supported (intentionally — design overrides
// don't make sense on raw text nodes).

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
      // Intercept in edit mode: dispatch a window event the admin overlay listens for.
      e.preventDefault()
      e.stopPropagation()
      window.dispatchEvent(new CustomEvent('design-edit-open', { detail: { id } }))
    },
  } : {}

  const className = editMode
    ? `${child.props.className ?? ''} outline outline-2 outline-amber-400/0 hover:outline-amber-400/80 cursor-pointer`.trim()
    : child.props.className

  return cloneElement(child, {
    ...dataAttrs,
    style: mergedStyle,
    className,
  })
}
