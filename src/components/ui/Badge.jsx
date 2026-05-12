const VARIANTS = {
  default: 'inline-flex items-center rounded-md px-2 py-0.5 text-[13px] font-medium',
  pill:    'inline-flex items-center rounded-full px-3 py-1 text-[13px] font-medium',
  band:    'flex items-center w-full rounded-md px-3 py-2 text-[14px] font-medium',
}

export default function Badge({ variant = 'default', className = '', children, ...props }) {
  return (
    <span className={`${VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </span>
  )
}
