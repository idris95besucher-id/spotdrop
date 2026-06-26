import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  href: string;
  metadata: Record<string, unknown>;
};

const PUSH_SOUND = "default";

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function buildPushPayload(notification: Pick<NotificationRow, "type" | "metadata">) {
  const metadata = notification.metadata ?? {};

  switch (notification.type) {
    case "direct_message": {
      const name = metadataString(metadata, "senderUsername") || "Someone";
      const preview = metadataString(metadata, "preview");
      return { title: name, body: preview || "Sent you a message" };
    }
    case "room_message": {
      const city = metadataString(metadata, "cityName") || "City room";
      const preview = metadataString(metadata, "preview");
      return { title: city, body: preview || "New room message" };
    }
    case "room_mention": {
      const name = metadataString(metadata, "senderUsername") || "Someone";
      const city = metadataString(metadata, "cityName") || "City room";
      const preview = metadataString(metadata, "preview");
      return { title: city, body: preview ? `${name}: ${preview}` : `${name} mentioned you` };
    }
    case "new_follower": {
      const name = metadataString(metadata, "followerUsername") || "Someone";
      return { title: "New follower", body: `${name} started following you` };
    }
    default:
      return { title: "SpotDrop", body: "You have a new notification" };
  }
}

function shouldSendPush(type: string) {
  return type === "direct_message" || type === "room_message" || type === "room_mention" || type === "new_follower";
}

async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
  project_id: string;
}) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const toBase64Url = (input: string) =>
    btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsigned = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(claim))}`;

  const pem = serviceAccount.private_key.replace(/\\n/g, "\n");
  const pemBody = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  const jwt = `${unsigned}.${toBase64Url(String.fromCharCode(...new Uint8Array(signature)))}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenJson = await tokenResponse.json();
  return tokenJson.access_token as string;
}

serve(async (request) => {
  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

  if (!supabaseUrl || !serviceRole || !serviceAccountRaw) {
    return new Response(JSON.stringify({ error: "Missing Supabase or Firebase config." }), { status: 503 });
  }

  let body: { notificationId?: string };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body." }), { status: 400 });
  }

  const notificationId = body.notificationId?.trim() ?? "";

  if (!notificationId) {
    return new Response(JSON.stringify({ error: "notificationId required." }), { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRole);
  const { data, error } = await admin
    .from("notifications")
    .select("id, user_id, type, href, metadata")
    .eq("id", notificationId)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!data) {
    return new Response(JSON.stringify({ error: "Notification not found." }), { status: 404 });
  }

  const notification: NotificationRow = {
    id: String(data.id),
    user_id: String(data.user_id),
    type: String(data.type),
    href: String(data.href),
    metadata: (data.metadata as Record<string, unknown> | null) ?? {},
  };

  if (!shouldSendPush(notification.type)) {
    return new Response(JSON.stringify({ sent: 0, skipped: "type_not_push_enabled" }), { status: 200 });
  }

  const { count: badgeCount } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", notification.user_id)
    .is("read_at", null);

  const payload = buildPushPayload(notification);

  const { data: tokenRows } = await admin
    .from("user_push_tokens")
    .select("token")
    .eq("user_id", notification.user_id);

  const tokens = (tokenRows ?? []).map((row) => String(row.token));

  if (!tokens.length) {
    return new Response(JSON.stringify({ sent: 0, fcmSent: 0 }), { status: 200 });
  }

  const serviceAccount = JSON.parse(serviceAccountRaw);
  const accessToken = await getGoogleAccessToken(serviceAccount);
  const projectId = serviceAccount.project_id;

  let fcmSent = 0;

  await Promise.all(
    tokens.map(async (token) => {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            data: {
              href: notification.href,
              type: notification.type,
              notificationId: notification.id,
            },
            apns: {
              payload: {
                aps: {
                  sound: PUSH_SOUND,
                  badge: badgeCount ?? 0,
                },
              },
            },
          },
        }),
      });

      if (response.ok) {
        fcmSent += 1;
      }
    })
  );

  return new Response(JSON.stringify({ sent: fcmSent, fcmSent, badge: badgeCount ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
