# iOS Push Notifications Setup (FCM + APNs)

SpotDrop uses **Firebase Cloud Messaging (FCM)** for native push. On iOS, FCM delivers through **Apple APNs**.

## Architecture

1. **Client (Capacitor iOS)** — `@capacitor-firebase/messaging` requests permission, registers FCM token → saved to Supabase `user_push_tokens`.
2. **Database** — Message inserts create `notifications` rows; trigger `dispatch_push_for_notification()` calls the push webhook (pg_net).
3. **Server** — `POST /api/push/send` (Next.js) or Supabase Edge Function `send-push` sends via **firebase-admin** (FCM/APNs). In-app toasts still use realtime (`ChatNotificationsProvider`).

### Push types enabled

| Event | Notification type | Title | Body | Deep link |
|-------|-------------------|-------|------|-----------|
| Direct message | `direct_message` | Sender username | Message preview | `/dm?id={senderId}` |
| City room message | `room_message` | City name | Message preview | `/rooms/{country}/{city}` |
| Room @mention | `room_mention` | City name | `@user: preview` | `/rooms/{country}/{city}` |
| New follower | `new_follower` | New follower | Username followed you | profile URL |

Sound: **default** · Badge: **unread notification count**

### Mute rules

- **DM**: no push if `chat_inbox_preferences.muted = true` for that partner.
- **Room**: no push if `room_memberships.is_muted = true` (room messages only).
- **Mentions**: still notify when room is muted (existing mention trigger).

---

## Personal Team (free Apple ID)

Push Notifications capability is **disabled** for local builds on a free Personal Team (not supported by Apple).

- `App.entitlements` is empty — no `aps-environment`
- `Info.plist` has no `remote-notification` background mode
- Firebase push **code remains**; registration fails gracefully at runtime
- **In-app realtime** (`ChatNotificationsProvider`) is unchanged

When you join the **Apple Developer Program**, re-enable push:

1. `cp ios/App/App/App.entitlements.with-push ios/App/App/App.entitlements`
2. Add `UIBackgroundModes` → `remote-notification` back to `Info.plist`
3. Set `CODE_SIGN_ENTITLEMENTS = App/App.entitlements` in `project.pbxproj` (Debug + Release)
4. Xcode → Signing & Capabilities → **Push Notifications**

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
```

Enable **pg_net** (Dashboard → Database → Extensions) and set webhook:

```sql
alter database postgres set app.push_webhook_url = 'https://YOUR_PRODUCTION_DOMAIN/api/push/send';
alter database postgres set app.push_webhook_secret = 'YOUR_PUSH_WEBHOOK_SECRET';
```

**Alternative:** Database Webhook on `notifications` INSERT → `POST /api/push/send` with `Authorization: Bearer YOUR_PUSH_WEBHOOK_SECRET` and body `{ "notificationId": "{{ record.id }}" }`.

**Edge Function alternative:** deploy `supabase/functions/send-push` and point `app.push_webhook_url` at the function URL instead of Vercel.

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

- Client: `[Push] FCM token registered`
- Client: `[Push] notification opened { href: ... }`
- Server: `{ sent, fcmSent, badge }`

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
