const RADIUS = {
  sm:   'rounded-sm',
  md:   'rounded-md',
  lg:   'rounded-lg',
  full: 'rounded-full',
  none: '',
}

function Box({ className = '', radius = 'md' }) {
  return <div className={`bg-surface-skeleton ${RADIUS[radius]} animate-pulse ${className}`} />
}

export function JobCardSkeleton() {
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Box className="h-9 w-9" radius="lg" />
          <div className="flex flex-col gap-2">
            <Box className="h-3.5 w-24" />
            <Box className="h-3 w-16" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Box className="h-4 w-14" />
          <Box className="h-3 w-10" />
        </div>
      </div>
      <div className="flex gap-4">
        <Box className="h-3 w-20" />
        <Box className="h-3 w-16" />
      </div>
    </div>
  )
}

export function HistoryRowSkeleton() {
  return (
    <div className="card flex items-center gap-3">
      <div className="flex-1 flex flex-col gap-2">
        <Box className="h-3.5 w-40" />
        <Box className="h-3 w-24" />
        <Box className="h-4 w-16 mt-1" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <Box className="h-4 w-14" />
        <Box className="h-4 w-4" radius="full" />
      </div>
    </div>
  )
}

export function OrderTrackingSkeleton() {
  return (
    <div className="px-5 pt-6 pb-6 flex flex-col gap-5">
      <Box className="h-4 w-12" />
      <div className="flex flex-col gap-2">
        <Box className="h-7 w-36" />
        <Box className="h-3 w-20" />
      </div>
      <div className="card flex justify-between items-start">
        <div className="flex flex-col gap-2">
          <Box className="h-4 w-24" />
          <Box className="h-3 w-16" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <Box className="h-5 w-16" />
          <Box className="h-3 w-8" />
        </div>
      </div>
      <div className="card flex flex-col gap-5">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex gap-3 items-center">
            <Box className="h-5 w-5 shrink-0" radius="full" />
            <Box className="h-3.5 w-32" />
          </div>
        ))}
      </div>
    </div>
  )
}
