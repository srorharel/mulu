# MULU store assets (generated)

Marketing graphics for the Google Play + App Store listings. All are faithful
recreations of the real consumer app screens (exact design tokens + live Hebrew
copy from `src/i18n/locales/he.json`) dressed in device frames with captions.

Built **for the v1 build with payments OFF** — no card/checkout surface is shown,
matching the shipped binary.

## Files → where they go

| File | Size | Google Play slot | App Store slot |
|------|------|------------------|----------------|
| `01-home.png` | 1290×2796 | Phone screenshot 1 | iPhone 6.7" screenshot 1 |
| `02-booking.png` | 1290×2796 | Phone screenshot 2 | iPhone 6.7" screenshot 2 |
| `03-tracking.png` | 1290×2796 | Phone screenshot 3 | iPhone 6.7" screenshot 3 |
| `04-beforeafter.png` | 1290×2796 | Phone screenshot 4 | iPhone 6.7" screenshot 4 |
| `05-complete.png` | 1290×2796 | Phone screenshot 5 | iPhone 6.7" screenshot 5 |
| `play-feature-1024x500.png` | 1024×500 | **Feature graphic** (required) | — |
| `play-icon-512.png` | 512×512 | **App icon** (required, 32-bit PNG) | — |
| `icon-1024.png` | 1024×1024 | hi-res / marketing icon | see note ↓ |

**Sizing notes**
- **6.7" (1290×2796)** is the size App Store Connect now requires; it auto-scales
  for 6.5"/6.9". You can upload the same 5 PNGs for the 6.5" slot if ASC asks.
- **Apple app icon** ships inside the binary (`ios/App/.../Assets.xcassets/AppIcon`,
  1024 RGB no-alpha) — ASC pulls it from the build, so you do **not** upload an icon
  for iOS. `icon-1024.png` here is a convenience/marketing copy; if you ever upload it
  to Apple, flatten the alpha channel first (Apple rejects icons with alpha).
- Play accepts a 512 PNG with alpha — `play-icon-512.png` is ready as-is.
- App Store needs **≥3** screenshots; Google Play needs **≥2**. Five are provided.

## Regenerate / tweak

Everything is rendered from `studio.html` (one self-contained file). Edit the copy
or layout there, then re-run headless Chrome:

```bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
URL="file:///C:/Users/srorh/Desktop/sparkler/store-assets/studio.html"
"$CHROME" --headless=new --disable-gpu --force-device-scale-factor=1 \
  --virtual-time-budget=4000 --window-size=1290,2796 \
  --screenshot="store-assets/01-home.png" "$URL?n=1"
```

`?n=` selects the slide: `1`–`5` (screenshots, 1290×2796), `feature` (1024×500),
`icon` (square — render at `--window-size=512,512` or `1024,1024`).

> These are not consumed by the app build (outside `src/`, not imported), so they
> don't affect `npm run build` or `npm run lint`. Add `store-assets/*.png` to
> `.gitignore` if you'd rather not commit ~8 MB of PNGs.
