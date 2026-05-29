// Mirror of src/context/DesignOverridesContext.jsx but uses support-app's
// own supabase client so the realtime sub goes through the right URL.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { loadDesignOverrides, subscribeDesignOverrides } from '../lib/designOverrides.js'

const DesignOverridesContext = createContext({ get: () => undefined })

export function DesignOverridesProvider({ app, children }) {
  const [map, setMap] = useState(new Map())

  useEffect(() => {
    loadDesignOverrides({ supabase, app, onUpdate: setMap })
    return subscribeDesignOverrides({ supabase, app, onUpdate: setMap })
  }, [app])

  const value = useMemo(() => ({
    get: (id) => map.get(id),
  }), [map])

  return (
    <DesignOverridesContext.Provider value={value}>
      {children}
    </DesignOverridesContext.Provider>
  )
}

export function useDesignOverride(id) {
  return useContext(DesignOverridesContext).get(id)
}
