# STORE_DATA_SAFETY.md — console fill-in guide

Click-by-click answers for the **Google Play Data safety** form and **Apple App Privacy**
("nutrition label") form for the MULU main app (`com.muluwash.app`). Derived from
`STORE_COMPLIANCE.md` §4/§5 and grounded in the current implementation.

> ⚠️ **One row is still BLOCKED:** *Payment info*. It depends on the external card
> processor (not yet chosen). See the **Payment info** note in each section and finalize
> before you submit. Everything else can be entered now.

---

## A. Google Play — Data safety

Console path: **Play Console → App content → Data safety**.

**Section 1 — Data collection & security (global answers):**
- Does your app collect or share any of the required user data types? → **Yes**
- Is all of the user data encrypted in transit? → **Yes** (HTTPS/TLS everywhere)
- Do you provide a way for users to request that their data is deleted? → **Yes**
  → URL: `https://muluwash.com/account/delete`

**Section 2 — Data types.** For each: mark *Collected*, set *Shared = No* (infra
providers Supabase/FCM are processors, not "sharing" in Play's sense — except the card
processor), *Processed ephemerally = No*, *Required (not optional)*, *Linked to the user
= Yes*.

| Play data type (category → type) | Collected | Shared | Purpose(s) to tick |
|---|---|---|---|
| **Location → Approximate location** | Yes | No | App functionality |
| **Location → Precise location** | Yes | No | App functionality |
| **Personal info → Name** | Yes | No | App functionality, Account management |
| **Personal info → Email address** | Yes | No | App functionality, Account management |
| **Personal info → Phone number** | Yes | No | App functionality, Account management, Communications |
| **Photos and videos → Photos** | Yes | No | App functionality, Fraud prevention/security & compliance |
| **Financial info → Purchase history** (order amounts/payout) | Yes | No | App functionality |
| **Financial info → Payment info** (card) | ⚠️ see note | ⚠️ see note | App functionality |
| **Messages → Other in-app messages** (order/support chat) | Yes | No | App functionality, Customer support |
| **App activity → App interactions** (orders, ratings) | Yes | No | App functionality |
| **Device or other IDs** (FCM push token) | Yes | No | App functionality (notifications) |

**⚠️ Payment info row (decide with the processor):**
- If card data is entered **only** inside the processor's hosted fields/SDK and never
  touches MULU servers → in Play's model the **processor collects** card data, so you may
  leave MULU's *Payment info (card)* **unticked** and only declare *Purchase history*
  (amounts/payout). This is the likely/cleanest answer.
- If MULU's own backend ever receives card/PAN data → tick **Payment info = Collected**,
  **Shared = Yes** (to the processor), purpose *App functionality*.
- Do not submit until this is confirmed.

---

## B. Apple — App Privacy

Console path: **App Store Connect → your app → App Privacy → Get Started / Edit**.

**Global:** *Do you or your third-party partners use data for tracking?* → **No**
(no ad SDKs, no cross-app tracking → **no ATT prompt**). Every type below = **"Data
Linked to You"**, **Not used for tracking**.

| Apple data type | Linked | Used for tracking | Purpose |
|---|---|---|---|
| **Location → Precise Location** | Yes | No | App Functionality |
| **Contact Info → Name** | Yes | No | App Functionality, Customer Support |
| **Contact Info → Email Address** | Yes | No | App Functionality, Customer Support |
| **Contact Info → Phone Number** | Yes | No | App Functionality, Customer Support |
| **User Content → Photos or Videos** | Yes | No | App Functionality |
| **User Content → Customer Support** (chat) | Yes | No | App Functionality, Customer Support |
| **User Content → Other User Content** (in-app messages) | Yes | No | App Functionality |
| **Financial Info → Payment Info** | ⚠️ see note | No | App Functionality |
| **Financial Info → Purchase History** (order amounts) | Yes | No | App Functionality |
| **Identifiers → Device ID** (push token) | Yes | No | App Functionality |
| **Usage Data → Product Interaction** (orders/ratings) | Yes | No | App Functionality |

**⚠️ Payment Info row:** same rule as Play — if card data lives only in the processor's
SDK and never reaches MULU, you can omit MULU's *Payment Info* and declare only *Purchase
History*. Confirm with the processor before submitting.

---

## C. Cross-check before you submit

- **Microphone / `RECORD_AUDIO`** is in the binary (in-app masked calls, currently ON).
  It is **not** a Play/Apple *data-collection* type (audio isn't recorded/stored — it's a
  live WebRTC stream), so it does **not** add a Data-safety/App-Privacy row. It only needs
  the permission usage string (already present: `NSMicrophoneUsageDescription` /
  manifest `RECORD_AUDIO`). If you ever launch with calls **OFF**, remove the mic
  permission so the binary matches these declarations.
- **No background location** is declared, so neither the Play background-location
  declaration form nor `NSLocationAlwaysAndWhenInUse` is required.
- Whatever you tick here must match the **permissions actually in the shipped binary** and
  the **permission usage strings** — a mismatch is a common rejection/Data-safety-warning.

_Source of truth for the reasoning: `STORE_COMPLIANCE.md` §4–§7._
