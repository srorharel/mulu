import { useEffect, useState, useRef } from 'react'

export function useDebouncedValue(value, delay = 500) {
  const [debounced, setDebounced] = useState(value)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      setDebounced(value)
      return
    }
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])

  return debounced
}
