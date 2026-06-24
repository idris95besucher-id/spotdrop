# iOS Push Notifications Setup (FCM + APNs)

SpotDrop uses **Firebase Cloud Messaging (FCM)** for native push. On iOS, FCM delivers through **Apple APNs**.

## Architecture

1. **Client (Capacitor iOS)** — `@capacitor-firebase/messaging` registers an FCM token → saved to Supabase `fcm_device_tokens`.
2. **Database** — Inserts into `notifications` trigger `dispatch_push_for_notification()` (pg_net).
3. **Server** — `POST /api/push/send` sends via **firebase-admin** (FCM/APNs) and **web-push** (browser).

### Push types enabled

| Event | Notification type | Deep link |
|-------|-------------------|-----------|
| Direct message | `direct_message` | `/dm?id={senderId}` |
| Room @mention | `room_mention` | `/rooms/{country}/{city}` |
| New follower | `new_follower` | profile URL |

Sound: **default** · Badge: **unread notification count**

---

## 1. Firebase project

1. Create a project at [Firebase Console](https://console.firebase.google.com/).
2. Add an **iOS app** with bundle ID: `com.spotdrop.app`.
3. Download **`GoogleService-Info.plist`** → place at:
   ```
   ios/App/App/GoogleService-Info.plist
   ```
4. In Firebase → **Project settings → Cloud Messaging**:
   - Upload your **APNs Authentication Key** (.p8) from Apple Developer.
   - Enter Key ID + Team ID.

---

## 2. Apple Developer

1. Enable **Push Notifications** capability for App ID `com.spotdrop.app`.
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
3. Confirm **Background Modes → Remote notifications** (already in `Info.plist`).
4. Confirm `GoogleService-Info.plist` is in the App target **Copy Bundle Resources**.
5. Build & run on a **physical iPhone** (push does not work on Simulator).

`AppDelegate.swift` already calls `FirebaseApp.configure()` when the plist is present.

---

## 4. Supabase database

Run the migration:

```bash
# Apply in Supabase SQL editor
database/add-fcm-push.sql
```

Enable **pg_net** (Supabase Dashboard → Database → Extensions) and configure webhook settings:

```sql
alter database postgres set app.push_webhook_url = 'https://YOUR_PRODUCTION_DOMAIN/api/push/send';
alter database postgres set app.push_webhook_secret = 'YOUR_PUSH_WEBHOOK_SECRET';
```

**Alternative:** Supabase **Database Webhook** on `notifications` INSERT → `POST /api/push/send` with `Authorization: Bearer YOUR_PUSH_WEBHOOK_SECRET` and body `{ "notificationId": "{{ record.id }}" }`.

---

## 5. Server environment variables

Add to Vercel / hosting:

| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase service account JSON (single line) |
| `PUSH_WEBHOOK_SECRET` | Secret for `/api/push/send` authorization |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push (browser) |
| `VAPID_PRIVATE_KEY` | Web push (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Already used for admin client |

Generate service account: Firebase → Project settings → Service accounts → Generate new private key.

---

## 6. Test on iPhone

1. `npm run cap:sync:ios` → run from Xcode on device.
2. Sign in → allow notifications when prompted (or Settings → Enable push).
3. Check Supabase `fcm_device_tokens` for your user's token.
4. From another account, send a DM or @mention you in a city room.
5. Background the app → push should arrive with sound + badge.
6. Tap notification → app opens the correct chat/room.

### Debug logs

- Client: `[Push] FCM token registered`
- Client: `[Push] notification opened { href: ... }`
- Server response: `{ sent, fcmSent, badge }`

---

## 7. Troubleshooting

| Problem | Fix |
|---------|-----|
| No token in `fcm_device_tokens` | Check `GoogleService-Info.plist`, Push capability, physical device |
| Token saved but no push | Verify `FIREBASE_SERVICE_ACCOUNT_JSON`, pg_net webhook, APNs key in Firebase |
| Push without sound | iOS Focus/Silent mode; server sends `sound: default` |
| Wrong screen on tap | Check `href` in notification row; bootstrap reads `data.href` |
| Badge stuck | Open app to sync; server sends fresh unread count on each push |
