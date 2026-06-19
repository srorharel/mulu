# STORE_LISTING.md

Ready-to-paste store-listing copy and form answers for **MULU**. Companion to `STORE_COMPLIANCE.md` (which has the policy reasoning). Hebrew-first (primary market: Israel); English provided for the en locale / US storefront.

- **App name:** MULU
- **Bundle id / package:** `com.sparklego.app`
- **Category:** Google Play → *Auto & Vehicles*; Apple → *Lifestyle*
- **Privacy Policy URL:** `https://muluwash.com/legal/privacy`
- **Support URL / email:** `https://muluwash.com` · `support@muluwash.com`
- **Marketing URL:** `https://muluwash.com`

> ⚠️ Ensure `support@muluwash.com` is a monitored inbox before launch. Confirm the legal docs are published & public before submitting the Privacy Policy URL.

---

## 1. Short description (Google Play, ≤ 80 chars)
- **HE:** שטיפת רכב מקצועית שמגיעה עד הרכב — בלי תורים, בלי לצאת מהבית.
- **EN:** A pro car wash that comes to your car — no lines, no leaving home.

## 2. Promotional text (Apple, ≤ 170 chars)
- **HE:** מזמינים שטיפה, והשוטף מגיע עד הרכב — בבית, בעבודה, איפה שהוא חונה. שקוף, מהיר, עם תיעוד לפני ואחרי.
- **EN:** Book a wash and a washer comes to your car — at home, at work, wherever it's parked. Fast, transparent, with before/after photos.

## 3. Full description (Google Play ≤ 4000 / Apple description)

**HE**
```
MULU מביאה את שטיפת הרכב ישר אליכם. מזמינים בכמה הקשות, והשוטף מגיע עד הרכב — בבית, בעבודה או בכל מקום שבו הוא חונה. בלי נסיעות, בלי תורים, בלי להמתין.

איך זה עובד:
• בוחרים מיקום וסוג רכב ומזמינים שטיפה.
• שוטף מקצועי בקרבתכם מקבל את ההזמנה ויוצא אליכם.
• עוקבים אחרי השוטף במפה בזמן אמת עד שהוא מגיע.
• מקבלים תיעוד תמונות של הרכב לפני ואחרי השטיפה.
• מדרגים את השירות בסיום.

למה MULU:
• נוחות מלאה — השירות מגיע אליכם.
• שקיפות — תמחור ברור מראש ותיעוד מלא.
• מעקב חי ויצירת קשר עם השוטף דרך הצ'אט.
• חשבונית מס/קבלה לכל שטיפה.

שוטפים: רוצים להצטרף ולהרוויח? נרשמים כשוטפים, עוברים אימות, ומקבלים עבודות באזור שלכם.
```

**EN**
```
MULU brings the car wash to you. Book in a few taps and a professional washer comes to your car — at home, at work, or wherever it's parked. No driving, no lines, no waiting.

How it works:
• Pick a location and your vehicle type, and request a wash.
• A nearby professional washer accepts and heads to you.
• Track the washer live on the map until they arrive.
• Get before/after photos of your car.
• Rate the service when it's done.

Why MULU:
• Total convenience — the service comes to you.
• Transparency — clear upfront pricing and full photo documentation.
• Live tracking and in-app chat with your washer.
• A tax invoice/receipt for every wash.

Washers: want to join and earn? Sign up as a washer, get verified, and receive jobs in your area.
```

---

## 4. Google Play — Data Safety form (answers)

Encryption in transit: **Yes**. Way to request deletion: **Yes** — `https://muluwash.com/account/delete`.

| Data type | Collected | Shared¹ | Processed ephemerally | Required | Purpose(s) | Linked to user |
|---|---|---|---|---|---|---|
| Approximate + **Precise location** | Yes | No | No | Optional² | App functionality | Yes |
| Name | Yes | No | No | Required | Account management, App functionality | Yes |
| Email address | Yes | No | No | Required | Account management | Yes |
| Phone number | Yes | No | No | Required | Account management, App functionality | Yes |
| Photos | Yes | No | No | Required³ | App functionality (vehicle/wash evidence, washer verification) | Yes |
| Messages (in-app) | Yes | No | No | Optional | App functionality (consumer↔washer / support chat) | Yes |
| App activity (orders, ratings) | Yes | No | No | Required | App functionality | Yes |
| Device/other IDs (FCM push token) | Yes | No | No | Optional | App functionality (notifications) | Yes |
| Payment info | **See §7 of STORE_COMPLIANCE.md** — answer once the processor is finalized | | | | | |

¹ "Shared" in the Play sense = sent to third parties beyond service providers/processors. Supabase (infra) and Google FCM (push) are processors, not "sharing." Within the app, order details are visible to the assigned counterpart + support.
² Location is optional in the Play sense (the app is usable without continuous sharing) but central to matching/navigation/arrival.
³ Required for the core flow (booking photos, washer verification).

**Data deletion answer:** users can delete in-app (Settings → מחיקת חשבון) **and** via the web URL above; orders are anonymized (PII removed) and financial records retained for tax/legal (~7 years).

---

## 5. Apple — App Privacy ("nutrition label") answers

**Tracking:** No (no third-party ad/tracking SDKs → no App Tracking Transparency prompt). All items below are **Data Linked to You**, **not** used for tracking.

| Data type | Purpose |
|---|---|
| Precise Location | App Functionality |
| Contact Info (name, email, phone) | App Functionality, Customer Support |
| Photos | App Functionality |
| User Content (messages, photos/evidence) | App Functionality, Customer Support |
| Identifiers (push token) | App Functionality |
| Payment Info | App Functionality *(set per the finalized processor; if card data is entered only in the processor's fields, the processor collects it, not MULU)* |

---

## 6. Content rating

User-to-user chat exists (consumer↔washer + support), **with Report + Block moderation** (`content_reports` / `content_blocks`). No violence, sexual, gambling, or mature content. Real-world service marketplace.

- **Google Play (IARC questionnaire):** answer No to violence/sexual/drugs/gambling; **Yes** to "users can interact / share content" (chat). Expect ~**Teen**. Declare the moderation tools.
- **Apple age rating:** likely **12+** given moderated UGC. Answer the UGC questions truthfully; the report/block tooling supports a lower rating than unmoderated UGC.

---

## 7. App Review notes (paste into Apple "App Review Information" + Google testing instructions)

```
MULU is a two-sided, on-demand mobile car-wash marketplace (Israel).
A consumer books a wash to their car's location; a verified washer travels
to the car, washes it, and uploads before/after photos.

DEMO ACCOUNTS (run scripts/seed-review-accounts.mjs to create/refresh):
  Consumer: review.consumer@muluwash.com / MuluReview!2026
  Washer (pre-approved): review.washer@muluwash.com / MuluReview!2026

To see both sides: log in as the consumer and book a wash; then log in as
the washer to accept and complete it.

NATIVE FEATURES (this is not a website wrapper):
  • Camera — capture before/after + verification photos
  • GPS/location — washer↔job matching, live tracking, 100 m arrival check
  • Push notifications — order status, chat, legal updates

PAYMENTS: MULU sells a real-world physical service (a car wash) consumed
outside the app, so payment is handled outside in-app purchase (per Apple
3.1.3(e) / Google physical-services policy). No digital goods are sold.

UGC: in-app chat includes Report + Block; support agents triage reports.

Account deletion: in-app (Settings → Delete account) and at
https://muluwash.com/account/delete.
```

---

## 8. Assets still needed (produce separately)
- **Google Play:** app icon 512×512, feature graphic 1024×500, ≥2 phone screenshots (+ 7" / 10" tablet if you keep tablet support).
- **Apple:** 1024×1024 marketing icon (from the new app icon), iPhone 6.7" + 6.5" screenshots (+ iPad if supported).
- Decide **iPhone-only vs iPad** (Info.plist currently allows iPad orientations).
