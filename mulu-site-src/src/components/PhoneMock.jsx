import { Home, Clock, User, MapPin, Check, Navigation, ChevronLeft, Camera, Gift } from 'lucide-react'
import { phone } from '../lib/content.js'

const TAB_ICONS = [Home, Clock, User]

// Israeli license plate — matches the real app's IsraeliPlate widget
// (fixed size, shrink-0, never wraps). Yellow #FFE74A, blue EU strip #1452AF.
function LicensePlate({ country, number }) {
  return (
    <div
      dir="ltr"
      className="inline-flex h-[34px] shrink-0 items-stretch overflow-hidden rounded-[6px] bg-[#FFE74A] font-mono"
      style={{ border: '1.5px solid #2a2a2a', boxShadow: '0 1px 0 rgba(0,0,0,0.1)' }}
    >
      <div className="flex w-[14px] items-end justify-center bg-[#1452AF] pb-[3px]">
        <span className="text-[7px] font-bold leading-none text-[#FFE74A]">{country}</span>
      </div>
      <div className="flex items-center justify-center whitespace-nowrap px-2.5 text-[16px] font-extrabold tracking-[1px] text-[#1a1a1a]">
        {number}
      </div>
    </div>
  )
}

export function PhoneMock() {
  return (
    <div className="relative mx-auto w-[290px] sm:w-[320px]" aria-hidden="true">
      {/* Floating promo chip — pushed out to the RIGHT, over the top corner (clear of the greeting) */}
      <div className="absolute -right-6 top-5 z-20 flex items-center gap-1.5 rounded-2xl bg-white px-2.5 py-1.5 shadow-lift sm:-right-16">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-shine/15 text-shine">
          <Gift className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
        <span className="flex flex-col leading-tight text-start">
          <span className="text-[13px] font-extrabold text-ink">{phone.promoTitle}</span>
          <span className="text-[9px] text-ink-mute">{phone.promoSub}</span>
        </span>
      </div>

      {/* Floating live-status pill — pushed out to the LEFT, low over the photo thumbnails (decorative) */}
      <div className="absolute -left-6 top-[66%] z-20 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-lift animate-float sm:-left-16">
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary-deep">
          <Navigation className="h-3.5 w-3.5" strokeWidth={2.4} />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-white" />
        </span>
        <span className="flex flex-col leading-tight text-start">
          <span className="text-[13px] font-bold text-ink">{phone.statusTitle}</span>
          <span className="text-[10px] text-ink-mute">{phone.statusMeta}</span>
        </span>
      </div>

      {/* Device */}
      <div className="relative rounded-[2.75rem] border-[6px] border-ink/90 bg-ink/90 shadow-lift">
        <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-ink/90" />
        <div className="overflow-hidden rounded-[2.25rem] bg-wash">
          <div className="flex flex-col gap-3 px-4 pb-3 pt-7">
            {/* header */}
            <div className="flex items-center justify-between pt-1">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary-deep">
                {phone.avatar}
              </span>
              <span className="text-base font-extrabold text-ink">{phone.greeting}</span>
              <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" width="32" height="32" />
            </div>

            <p className="text-[15px] font-bold text-ink">{phone.question}</p>

            {/* location card */}
            <div className="rounded-2xl border border-line bg-white p-3 shadow-soft">
              <span className="text-xs font-semibold text-ink-mute">{phone.locationLabel}</span>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mist text-primary-deep">
                  <MapPin className="h-4 w-4" strokeWidth={2.4} />
                </span>
                <span className="text-sm font-bold text-ink">{phone.address}</span>
              </div>
              <span className="mt-2 block text-[11px] text-ink-mute">{phone.locationHint}</span>
            </div>

            {/* vehicle confirm with license plate (plate on its own row, like the app) */}
            <div className="rounded-2xl border border-line bg-white p-3 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink-mute">{phone.vehicleSectionLabel}</span>
                <LicensePlate country={phone.plateCountry} number={phone.plate} />
              </div>
              <p className="mt-2 text-sm font-bold text-ink">{phone.vehicle}</p>
              <p className="text-[11px] text-ink-mute">{phone.confirm}</p>
              <button className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-mist py-2 text-xs font-bold text-primary-deep">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                {phone.yes}
              </button>
            </div>

            {/* car photos — matches the real app order page */}
            <div className="rounded-2xl border border-line bg-white p-3 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="block text-xs font-semibold text-ink-soft">{phone.photosTitle}</span>
                  <span className="text-[11px] text-ink-mute">{phone.photosSubtitle}</span>
                </div>
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary-deep">
                  {phone.photosCount}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-mist">
                    <Camera className="h-4 w-4 text-primary/40" strokeWidth={2} />
                    <span className="absolute bottom-0.5 left-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-white">
                      <Check className="h-2 w-2" strokeWidth={3.5} />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* order CTA */}
            <button className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-primary py-3 text-sm font-extrabold text-white shadow-glow">
              {phone.orderBtn}
              <ChevronLeft className="h-4 w-4" strokeWidth={2.6} />
            </button>
          </div>

          {/* bottom tab bar — matches the app (בית / היסטוריה / פרופיל) */}
          <div className="flex items-center justify-around border-t border-line bg-white px-2 pb-4 pt-2">
            {phone.tabs.map((t, i) => {
              const I = TAB_ICONS[i]
              const active = i === 0
              return (
                <span key={t} className={`flex flex-1 flex-col items-center gap-0.5 text-[10px] font-semibold ${active ? 'text-primary-deep' : 'text-ink-mute'}`}>
                  <span className={`rounded-xl px-3 py-1 ${active ? 'bg-mist' : ''}`}>
                    <I className="h-5 w-5" strokeWidth={active ? 2.6 : 2} />
                  </span>
                  {t}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
