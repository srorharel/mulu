# STORE_COMPLIANCE.md

App-store compliance reference for **MULU** (two-sided on-demand car-wash marketplace).
Covers permission strings, Google Play Data Safety / Apple Privacy Label answers, account
deletion, UGC moderation, and payments. Grounded in the current implementation.

- **Android package:** `com.sparklego.app` (consumer + washer). Support app: `com.sparklego.support` (agents; not consumer-facing, internal distribution).
- **iOS:** no `ios/` Capacitor project exists yet. The iOS strings below are ready to paste into `Info.plist` when the iOS target is added.
- **Backend:** Supabase (Postgres + Storage + Auth + Realtime). Push via Firebase Cloud Messaging (FCM).
- **Service model:** real-world physical car wash → **NOT** digital goods. Payments use an **external card processor**, not Apple/Google in-app purchase (see §7).

---

## 1. Account deletion (Play / App Store blocker)

- **Public deletion URL (submit to Google Play "Data deletion" + App Store):** `https://<production-domain>/account/delete`
  - Logged-in: runs the in-app deletion flow directly.
  - Logged-out: shows Hebrew instructions, what is deleted vs retained, and a support contact (`support@wash.co.il`).
- **In-app:** Consumer `Settings → מחיקת חשבון` and Washer `Settings → מחיקת חשבון`. A type-to-confirm modal lists the consequences; on confirm it calls the `delete-account` Edge Function, unregisters the push token, and signs out.
- **What is deleted:** profile, vehicles, chats (order + support messages the user sent and conversations they opened), ratings they authored, push tokens, notification preferences/log, legal acknowledgments, content reports/blocks, washer-verification documents, and all per-user storage objects (`washer-verification/{uid}/*`, `car-photos/{uid}/*`, `job-evidence` for the user's own orders).
- **What is retained (and why):** order rows are **anonymized, not deleted** — PII columns (car make/model/year/color/plate, photo paths, access notes, submitted coordinates) are nulled and the user link is removed (`consumer_id`/`washer_id` set NULL), but financial/audit columns (`base_price`, `platform_fee`, `total_price`, `payout_amount`, `status`, timestamps) and the `order_events` audit trail are kept for **legal/tax retention (~7 years)**. These records carry no link back to the deleted person.

---

## 2. Android — permissions declared & rationale

Declared in `android/app/src/main/AndroidManifest.xml`:

| Permission | Why |
|---|---|
| `INTERNET` | Core networking (Supabase, FCM). |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | Match washers to nearby jobs, navigate the washer to the car, and verify arrival via the 100 m geofence; show the consumer the washer's live position during an active order. |
| `CAMERA` | Photograph the car before/after the wash (consumer + washer evidence) and capture washer verification (ID, selfie, business license). |
| `POST_NOTIFICATIONS` (Android 13+) | Transactional push (order status, chat, legal-document updates). Added by the `@capacitor/push-notifications` plugin; confirm it is present in the merged manifest before release. |

`<uses-feature android:name="android.hardware.camera" android:required="false" />` keeps the app installable on camera-less devices.

**Runtime rationale text (show before the OS prompt):**
- Location — he: *"המיקום משמש לשיבוץ שוטף קרוב אליך, ניווט אל הרכב ואימות הגעה. ניתן להשתמש באפליקציה גם בלי שיתוף מיקום מתמשך."* / en: *"Location is used to match a nearby washer, navigate to your car, and verify arrival."*
- Camera — he: *"המצלמה משמשת לצילום הרכב לפני ואחרי השטיפה ולאימות זהות השוטף."* / en: *"The camera is used to photograph the car before and after the wash and to verify the washer's identity."*

**Foreground vs. background location (washer GPS).** The app currently requests **foreground (while-in-use) location only** — there is no `ACCESS_BACKGROUND_LOCATION` declaration. The 100 m arrival geofence and live washer tracking run **while the washer app is in the foreground / actively on a job**, so they remain a foreground-service / while-in-use use case (geofencing is no longer an approved foreground-service *type*, but while-in-use location during an active, user-initiated job is fine).
- **If** washer tracking later needs to continue with the app backgrounded, you must: declare `ACCESS_BACKGROUND_LOCATION`, gate it behind a separate runtime prompt, add a persistent foreground-service notification with `foregroundServiceType="location"`, and complete the **Google Play background-location declaration form** (video walkthrough + justification). Not required for the current foreground-only model.

---

## 3. iOS — Info.plist usage strings (paste when the iOS target is added)

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>המיקום משמש לשיבוץ שוטף קרוב, ניווט אל הרכב ואימות הגעה.</string>

<key>NSCameraUsageDescription</key>
<string>המצלמה משמשת לצילום הרכב לפני ואחרי השטיפה.</string>
```

English equivalents (if a localized `InfoPlist.strings` is added):
- `NSLocationWhenInUseUsageDescription` — *"Location is used to match a nearby washer, navigate to your car, and verify arrival."*
- `NSCameraUsageDescription` — *"The camera is used to photograph the car before and after the wash."*

No background-location key (`NSLocationAlwaysAndWhenInUseUsageDescription`) is needed under the current foreground-only model. Push notifications on iOS require the **Push Notifications** capability + APNs key (no Info.plist string).

---

## 4. Google Play — Data Safety answers

For each type: **Collected** (we gather it), **Shared** (sent to third parties beyond service providers/processors), **Linked to identity**, **Purpose**, **Deletion offered**. Processing is encrypted in transit (HTTPS/TLS) and users can request deletion (§1).

| Data type | Collected | Shared | Linked | Purpose | Deletion |
|---|---|---|---|---|---|
| **Precise location** | Yes | No¹ | Yes | App functionality — washer↔job matching, navigation, 100 m arrival verification, live tracking during an active order | Yes |
| **Photos** (car before/after, wash evidence, washer ID/selfie/license) | Yes | No¹ | Yes | App functionality + fraud prevention / washer verification | Yes |
| **Name, phone, email** | Yes | No¹ | Yes | Account management, communication between parties and support | Yes |
| **Payment info** | Yes² | Yes² (card processor) | Yes | Process payment for the wash; store order amounts & payout for records | Card data: held by processor. Order/payout records: retained anonymized (§1) |
| **App activity** (orders, ratings, in-app messages) | Yes | No¹ | Yes | App functionality, dispute/quality handling | Yes (orders anonymized) |
| **Device / push token (FCM)** | Yes | No¹ | Yes | Deliver transactional & legal-update notifications | Yes (token removed on sign-out/deletion) |

¹ Not "shared" in the Play sense — data is processed by infrastructure **service providers** (Supabase for storage/DB, Google FCM for push). Within the app, an order's relevant details are visible to the assigned counterpart (consumer ↔ washer) and to support agents handling the order.
² **Confirm with the integrated card processor before submitting.** If card data is entered directly into the processor's SDK/hosted fields and never touches MULU servers, Data Safety should reflect that the *processor* collects card data; MULU stores only amounts/payout (financial records). Update this row once the processor is finalized.

---

## 5. Apple — App Privacy ("Nutrition label") answers

| Data type | Used to track? | Linked to user | Purpose |
|---|---|---|---|
| Precise Location | No | Yes | App Functionality |
| Photos | No | Yes | App Functionality |
| Contact Info (name, phone, email) | No | Yes | App Functionality, Customer Support |
| Payment Info | No | Yes | App Functionality (purchase of the wash) |
| User Content (chat messages, evidence) | No | Yes | App Functionality, Customer Support |
| Identifiers (push token) | No | Yes | App Functionality (notifications) |

- **Tracking:** MULU does **not** track users across other companies' apps/sites and does not use third-party advertising SDKs → no App Tracking Transparency prompt required.
- All categories are "Data Linked to You" and used for app functionality / support, never for tracking.

---

## 6. UGC moderation (report & block)

User-generated content = in-app chat (order chat between consumer↔washer, and support chat). Required moderation is implemented:
- **Report:** any chat message can be reported (`content_reports`); the report records the reporter, the reported user, the context (`order_chat`/`support_chat`), the message, and a reason.
- **Block:** in order chat a user can block the counterpart (`content_blocks`) — the blocked party's messages stop rendering and composing is disabled, with an unblock option. (Blocking is not offered against the support team in support chat, by design.)
- **Agent review:** support agents see all reports in a dedicated **Reports** view in the support app, with a live badge for open reports and an `open → reviewed → actioned` workflow.

This satisfies the App Store UGC requirement (a method to report objectionable content and block abusive users, plus a moderation/response path).

---

## 7. Payments — not IAP

MULU sells a **real-world physical service** (washing a car). Per Apple App Store Review Guideline 3.1.3(e) (goods/services consumed outside the app) and Google Play's physical-goods/services policy, this is **out of scope for in-app purchase**. Payment is handled by an **external card processor**; do not use Apple/Google IAP for wash purchases. (Confirm the specific processor + its SDK/redirect model and reflect it in §4 row "Payment info".)

---

## 8. Pre-submission checklist

- [ ] Set the production domain in the deletion URL (§1) and submit it in both consoles.
- [ ] Confirm `POST_NOTIFICATIONS` is in the release merged manifest (Android 13+).
- [ ] Finalize the card processor and update the Payment-info rows (§4, §7).
- [ ] When adding iOS: paste the Info.plist strings (§3), enable Push Notifications capability, and fill the App Privacy form (§5).
- [ ] Device-test the runtime permission prompts show the rationale copy (§2).
