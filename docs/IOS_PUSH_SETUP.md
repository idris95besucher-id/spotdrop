# iOS Push Notifications Setup (FCM + APNs)

SpotDrop uses **Firebase Cloud Messaging (FCM)** for native push. On iOS, FCM delivers through **Apple APNs**.

## Architecture

1. **Client (Capacitor iOS)** — `@capacitor-firebase/messaging` requests permission, registers FCM token → saved to Supabase `user_push_tokens`.
2. **Database** — Message inserts create `notifications` rows; trigger `dispatch_push_for_notification()` queues `pg_net` → webhook (see `push_dispatch_log`).
3. **Sender client (immediate)** — After a successful DM/group/room insert, the sender calls `POST /api/push/send` with `{ messageId, type }` + user JWT so FCM/APNs fires even if the recipient app is killed and even if DB GUCs are unset.
4. **Server** — `POST /api/push/send` (webhook with `notificationId`, or sender JWT with `messageId`) → **firebase-admin** `sendEachForMulticast` → FCM → APNs. In-app toasts use realtime while the app is open.

### Push types enabled

| Event | Notification type | Title | Body | Deep link |
|-------|-------------------|-------|------|-----------|
| Direct message | `direct_message` | Sender username | Message preview | `/dm?id={senderId}` |
| Group message | `group_message` | Group name | Sender + preview | `/group?id={groupId}` |
| City room message | `room_message` | City name | Message preview | `/rooms/{country}/{city}` |
| Room @mention | `room_mention` | City name | `@user: preview` | `/rooms/{country}/{city}` |
| New follower | `new_follower` | New follower | Username followed you | profile URL |

Sound: **default** (omitted when user Sound switch is off) · Badge: **unread notification count**

### Mute rules

- **DM**: no push if `chat_inbox_preferences.muted = true` for that partner.
- **Room**: no push if `room_memberships.is_muted = true` (room messages only).
- **Mentions**: still notify when room is muted (existing mention trigger).

---

## Personal Team (free Apple ID)

Free Personal Teams cannot enable Push. Use a paid Apple Developer Program team.

This repo enables push by default:

- `App.entitlements` → `aps-environment = development`
- `Info.plist` → `UIBackgroundModes` / `remote-notification`
- `CODE_SIGN_ENTITLEMENTS = App/App.entitlements`

In Xcode → Signing & Capabilities, confirm **Push Notifications** is present for the App target.

---

## iOS setup checklist

- [ ] **GoogleService-Info.plist** from Firebase → `ios/App/App/GoogleService-Info.plist` (App target, Copy Bundle Resources)
- [ ] **Push Notifications** capability in Xcode (App ID `com.spotdrop.app`)
- [ ] **Background Modes → Remote notifications** (in `Info.plist` / Xcode)
- [ ] **APNs Authentication Key (.p8)** uploaded in Firebase → Project settings → Cloud Messaging (Key ID + Team ID)
- [ ] **Bundle ID** in Firebase iOS app matches Xcode: `com.idrisgazimagomaev.spotdropapp`
- [ ] **Physical iPhone** — push does not work on Simulator
- [ ] **Server**: `FIREBASE_SERVICE_ACCOUNT_JSON` + `PUSH_WEBHOOK_SECRET` configured
- [ ] **Supabase**: run SQL migrations + pg_net webhook URL

`AppDelegate.swift` calls `FirebaseApp.configure()` only when the plist is valid; the app runs without push if Firebase is missing.

---

## 1. Firebase project

1. Create a project at [Firebase Console](https://console.firebase.google.com/).
2. Add an **iOS app** with bundle ID: `com.idrisgazimagomaev.spotdropapp` (must match Xcode).
3. Download **`GoogleService-Info.plist`** → place at:
   ```
   ios/App/App/GoogleService-Info.plist
   ```
4. In Firebase → **Project settings → Cloud Messaging**:
   - Upload your **APNs Authentication Key** (.p8) from Apple Developer.
   - Enter Key ID + Team ID.

---

## 2. Apple Developer

1. Enable **Push Notifications** capability for App ID `com.idrisgazimagomaev.spotdropapp`.
2. Create an **APNs Key** (Apple Push Notifications service, .p8).
3. Upload the key to Firebase (step 1.4).

---

## 3. Xcode

```bash
npm run cap:sync:ios
open ios/App/App.xcodeproj
```

In Xcode:

1. Select **App** target → **Signing & Capabilities**.
2. Add **Push Notifications**.
3. Confirm **Background Modes → Remote notifications**.
4. Confirm `GoogleService-Info.plist` is in the App target **Copy Bundle Resources**.
5. Build & run on a **physical iPhone**.

---

## 4. Supabase database

Run in order (SQL editor):

```text
database/add-user-push-tokens.sql
database/add-fcm-push.sql          -- if not already applied (legacy fcm_device_tokens + room mentions)
database/enable-ios-message-push.sql
database/enable-message-push-prefs-and-groups.sql  -- group push + user_notification_preferences
database/fix-push-dispatch-reliability.sql       -- config table + push_dispatch_log
```

Enable **pg_net** (Dashboard → Database → Extensions) and set webhook via config table (preferred):

```sql
insert into public.push_webhook_config (id, url, secret)
values (1, 'https://YOUR_PRODUCTION_DOMAIN/api/push/send', 'YOUR_PUSH_WEBHOOK_SECRET')
on conflict (id) do update
set url = excluded.url, secret = excluded.secret, updated_at = now();
```

Or legacy GUCs:

```sql
alter database postgres set app.push_webhook_url = 'https://YOUR_PRODUCTION_DOMAIN/api/push/send';
alter database postgres set app.push_webhook_secret = 'YOUR_PUSH_WEBHOOK_SECRET';
```

**Diagnose chain:**

```sql
select stage, detail, created_at
from public.push_dispatch_log
order by created_at desc
limit 20;
```

- `skipped_no_webhook_config` → config/GUCs missing (sender `/api/push/send` with `messageId` still works after deploy)
- `http_post_queued` → pg_net accepted; check Vercel logs for `[Push] webhook received` / `FCM/APNs`
- `http_post_error` → pg_net/extension problem

**Alternative:** Database Webhook on `notifications` INSERT → `POST /api/push/send` with `Authorization: Bearer YOUR_PUSH_WEBHOOK_SECRET` and body `{ "notificationId": "{{ record.id }}" }`.

**Edge Function alternative:** deploy `supabase/functions/send-push` and point `push_webhook_config.url` at the function URL instead of Vercel.

---

## 5. Server environment variables

| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase service account JSON (single line) |
| `PUSH_WEBHOOK_SECRET` | Secret for `/api/push/send` authorization |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client for token lookup |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push (browser, optional) |
| `VAPID_PRIVATE_KEY` | Web push (browser, optional) |

For Edge Function `send-push`, set secrets: `FIREBASE_SERVICE_ACCOUNT_JSON`, `PUSH_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## 6. Test on iPhone

1. `npm run cap:sync:ios` → run from Xcode on device.
2. Sign in → allow notifications when prompted.
3. Verify token in Supabase **`user_push_tokens`** (platform = `ios`).
4. **Background the app** (home button / swipe up).
5. From another account:
   - Send a **DM** → title = sender username, body = preview, tap opens DM thread.
   - Send a **room message** in a city you joined → title = city name, body = preview.
   - **@mention** in a room → mention push even if room muted.
6. Mute a DM or room → confirm no push for that chat (mentions still work).

### Debug logs

On device (Xcode console / Safari Web Inspector):

1. `[SpotDrop] APNs device token registered` — native APNs OK  
2. `[SpotDrop] Messaging.apnsToken set for FCM` — Firebase has APNs token  
3. `[Push] permission granted`  
4. `[Push] APNs token received` (JS)  
5. `[Push] FCM token abcd…`  
6. `[Push] token saved` / `[Push] registration complete` — row in `user_push_tokens`

If the table stays empty, the first missing log above is the failing stage.

| Missing log | Likely cause |
|-------------|--------------|
| APNs device token | Push capability / Personal Team / Simulator |
| Messaging.apnsToken | Firebase not configured / plist |
| permission granted | User denied notifications |
| FCM token | APNs→FCM race (fixed in `lib/nativePush.ts`) or APNs key in Firebase |
| token saved | Auth/RLS/`profiles` FK — check `[Push] save token failed` |

---

## 7. Troubleshooting

| Problem | Fix |
|---------|-----|
| No token in `user_push_tokens` | `GoogleService-Info.plist`, Push capability, physical device, sign in |
| Token saved but no push | `FIREBASE_SERVICE_ACCOUNT_JSON`, pg_net webhook URL/secret, APNs key in Firebase |
| Room messages no push | Run `enable-ios-message-push.sql` (includes `room_message` in dispatch) |
| Push without sound | iOS Focus/Silent mode; server sends `sound: default` |
| Wrong screen on tap | Check `notifications.href`; client reads FCM `data.href` |
| Badge stuck | Open app; each push sends fresh unread count |
| App works but no Firebase | Expected — add plist to enable push; in-app realtime still works |
