# Saved Vehicles — Phase 0 Audit

## Current state

### Database (orders table)
Car identity columns written at booking time (all nullable TEXT/INTEGER unless noted):

| Column | Type | Added in |
|--------|------|----------|
| `car_plate` | TEXT | 0017 |
| `car_make` | TEXT | 0016 |
| `car_model` | TEXT | 0016 |
| `car_year` | INTEGER | 0016 |
| `car_color` | TEXT | 0017 |
| `car_type` | TEXT NOT NULL CHECK | 0001 (`'private'\|'jeep'\|'pickup'`) |

Also: `car_photo_front/back/driver/passenger TEXT` (4-angle photos, added in 0037). These are Storage paths.

No `vehicle_id` column exists anywhere today.

### Code path (booking flow)
1. `LicensePlatePicker.jsx` — self-contained component; manages lookup state machine (`idle → looking_up → found → confirmed | not_found | error`). Emits `onChange({ make, model, year, plate, color, category, isValid })`.
2. `Home.jsx` — holds `licenseData` state via `setLicenseData`; passes all fields inline into the `orders` INSERT. No vehicle persistence today.
3. `Profile.jsx` (`/profile`) — shows name/phone/equipment fields. No vehicle section.
4. No `vehicles` table exists; no saved vehicle concept anywhere.

---

## Proposed schema

### New table: `vehicles`

```sql
CREATE TABLE public.vehicles (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumer_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plate        TEXT NOT NULL,        -- normalized digits, e.g. "1234567" or "12345678"
  nickname     TEXT NOT NULL,        -- consumer-given label, e.g. "12-345-67" or "My Corolla"
  make         TEXT,
  model        TEXT,
  year         INTEGER,
  color        TEXT,
  category     TEXT CHECK (category IN ('private', 'jeep', 'pickup')),
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One default per consumer: partial unique index (cleaner than trigger)
CREATE UNIQUE INDEX vehicles_one_default_per_consumer
  ON public.vehicles (consumer_id)
  WHERE is_default = true;

CREATE INDEX vehicles_consumer_id_idx ON public.vehicles (consumer_id);
CREATE INDEX vehicles_consumer_default_idx ON public.vehicles (consumer_id, is_default);
```

`plate` stores the raw normalized digit string (matching what `result.plate` from `vehicleLookup.js` already produces). `nickname` defaults to the formatted plate string (e.g. `"12-345-67"`) but the user can edit it before confirming.

### Orders table addition

```sql
ALTER TABLE public.orders
  ADD COLUMN vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;
```

`ON DELETE SET NULL` so deleting a saved vehicle never breaks historical order records.

### RLS policies

```sql
-- Consumer reads only their own vehicles
CREATE POLICY "vehicles: consumer reads own"
  ON public.vehicles FOR SELECT TO authenticated
  USING (consumer_id = auth.uid());

-- Consumer inserts only their own vehicles
CREATE POLICY "vehicles: consumer inserts own"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (consumer_id = auth.uid());

-- Consumer updates only their own vehicles
CREATE POLICY "vehicles: consumer updates own"
  ON public.vehicles FOR UPDATE TO authenticated
  USING (consumer_id = auth.uid())
  WITH CHECK (consumer_id = auth.uid());

-- Consumer deletes only their own vehicles
CREATE POLICY "vehicles: consumer deletes own"
  ON public.vehicles FOR DELETE TO authenticated
  USING (consumer_id = auth.uid());
```

No agent/washer access to `vehicles` — they read the denormalized `car_plate`/`car_make`/`car_model` already on the `orders` row, which is sufficient.

---

## UI changes needed

### 1. `src/components/consumer/LicensePlatePicker.jsx`
- **Add a controlled "pre-confirmed" mode**: accept an optional `initialVehicle` prop (same shape as the emitted object). When provided, skip straight to `confirmed` state on mount with `result` pre-set. This lets Home feed in a saved vehicle without re-running the lookup API.
- **Add an `onEdit` callback** (or reuse the existing `editPlate`) so the Home sheet can intercept the edit action and open the vehicle-picker sheet instead of resetting to blank input.

### 2. `src/pages/consumer/Home.jsx`
- On mount, `SELECT * FROM vehicles WHERE consumer_id = uid ORDER BY is_default DESC, created_at DESC`.
- If a default vehicle exists, set `licenseData` to its fields and skip the picker's lookup state (using the pre-confirmed prop above).
- Replace the raw `<LicensePlatePicker>` in the vehicle card with a new `<VehicleSelector>` wrapper:
  - Shows the pre-confirmed plate + "Change vehicle" button when a vehicle is selected.
  - "Change vehicle" opens a bottom sheet (`VehiclePickerSheet`) with the saved vehicle list + "Enter a new plate" row.
- Add `vehicle_id` to the `orders` INSERT payload (null when the plate came from the free-text path).
- After a successful booking **when `vehicle_id` is null**, show a `SaveVehicleDialog` with nickname pre-filled as the formatted plate.

### 3. New component: `src/components/consumer/VehiclePickerSheet.jsx`
Bottom sheet with:
- List of saved vehicles (each row: `IsraeliPlate` + nickname + make/model + default badge if applicable, selectable).
- "Enter a new plate" row at the bottom (falls back to the existing full lookup flow via `LicensePlatePicker`).
- "Change default" action surfaced per-row (or via a long-press/menu — see Open Q 4).

### 4. New component: `src/components/consumer/SaveVehicleDialog.jsx`
Post-booking dialog (only shown when plate was from the free-text path):
- Nickname input, pre-filled with formatted plate string.
- Confirm → INSERT into `vehicles`, potentially sets as default if none exists.
- Dismiss → no-op.

### 5. New page: `src/pages/consumer/Vehicles.jsx` (route TBD — see Open Q 1)
Vehicle management:
- List of saved vehicles.
- "Add vehicle" button → nickname → plate → lookup → confirm → save.
- Per-row edit (nickname only, inline or modal), delete with `ConfirmDialog`, set-as-default action.
- All copy through i18n (en + he).
- Uses `GlassCard`, `IsraeliPlate`, `MotionButton`.

### 6. `src/pages/Profile.jsx`
- Add a "My vehicles" row (consumer-only) that navigates to the vehicles management page.

### 7. `src/router.jsx`
- Add the new vehicles route inside the consumer `RoleGuard` + `ConsumerLayout`.

### 8. `src/i18n/locales/en.json` and `he.json`
- New keys under `consumer.vehicles.*` for all UI copy.

---

## Migration story

**Existing orders:** `vehicle_id` is nullable, so all existing rows stay valid with `vehicle_id = null`. No backfill needed.

**Existing consumers (no saved vehicles):** On their next Home visit there will be no default vehicle, so the UI falls back to the current free-text `LicensePlatePicker` flow. The "Change vehicle" sheet will show an empty list plus "Enter a new plate". No disruption.

**First-ever booking by a new consumer:** Same as existing consumers — no saved vehicles, full lookup flow, optional save prompt after booking.

**Default-switching:** The partial unique index on `(consumer_id) WHERE is_default = true` enforces the constraint at the DB level. To switch default: UPDATE old row set `is_default = false`, then UPDATE new row set `is_default = true` — or do it in a single RPC to avoid the unique violation on concurrent writes. (See Open Q 3.)

---

## Open questions

1. **Route for vehicles management page.** Options:
   - `/profile/vehicles` — sub-route under profile. Router change is minor. Conceptually grouped with account settings. Requires adding a sub-route to the Profile route, which is currently not nested.
   - `/vehicles` — standalone consumer route under `ConsumerLayout`. Simpler routing; accessed from a link in Profile.
   - **Section in Profile.jsx** — inline accordion/list within the existing profile screen. No new route. Trades navigation depth for screen length. Profile is already short (name, phone, sign out) so this is feasible.

2. **Where does `vehicle_id` get written on the order insert?** It must be the Supabase UUID of the selected saved vehicle. Because `Home.jsx` currently builds the insert payload entirely in client JS, this is a straightforward addition. Confirm this is acceptable, or should the FK be stamped by a DB trigger/function? (Given the existing pattern of client-supplied IDs, client-supplied `vehicle_id` is consistent.)

3. **Default-switching atomicity.** The partial unique index prevents two rows from both having `is_default = true` for the same consumer at the DB level. A naïve two-step UPDATE (clear old, set new) will pass because they're sequential. But should we wrap this in an RPC to guarantee safety if the client disconnects between the two updates? (Low risk for a single-user feature, but worth flagging.)

4. **Per-row actions in `VehiclePickerSheet`.** "Set as default" action on a sheet row — tap to select for this booking, or swipe/long-press to manage? A separate icon button inline in the row (e.g., a star) is simpler and avoids gesture ambiguity. Confirm preferred pattern.

5. **`category` field on manually-entered vehicles.** When the lookup fails and the consumer uses the manual fallback, `category` (private/jeep/pickup) is collected. This should be stored in `vehicles.category` alongside the other fields. Confirm that saving category for manual-entry vehicles is desired.

6. **Post-booking dialog: set as default?** When the consumer saves a new vehicle after booking, should it auto-become the default (if they have no default yet), or always require a deliberate "set as default" action? The spec says "one marked default" but doesn't specify the save-prompt behavior.
