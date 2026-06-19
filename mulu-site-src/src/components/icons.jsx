// Single icon family (lucide) so stroke width + corner radius stay consistent
// across the whole site — satisfies the icon-style-consistent / no-emoji rules.
import {
  MapPin, Camera, Sparkles, Map, Star, Bell, Home, Briefcase, Globe,
  Wallet, TrendingUp, Clock, ShieldCheck, Search, Check,
} from 'lucide-react'

const MAP = {
  pin: MapPin, camera: Camera, sparkles: Sparkles, map: Map, star: Star,
  bell: Bell, home: Home, briefcase: Briefcase, globe: Globe, wallet: Wallet,
  trending: TrendingUp, clock: Clock, shield: ShieldCheck, search: Search, check: Check,
}

export function Icon({ name, ...props }) {
  const Cmp = MAP[name] || Sparkles
  // Icons are decorative (always paired with a visible text label), so hide them
  // from assistive tech by default. Callers can override aria-* via props.
  return <Cmp strokeWidth={2.2} aria-hidden="true" focusable="false" {...props} />
}
