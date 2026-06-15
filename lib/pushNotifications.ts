import { supabase } from "@/lib/supabaseClient";

const SW_PATH = "/sw.js";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIosDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function pushPermissionState(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) {
    return "unsupported";
  }

  return Notification.permission;
}

async function registerServiceWorker() {
  const registration = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function subscriptionPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const keys = json.keys;

  if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
    return null;
  }

  return {
    endpoint: json.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  };
}

export async function savePushSubscription(userId: string, subscription: PushSubscription) {
  const payload = subscriptionPayload(subscription);

  if (!payload) {
    return { error: "Invalid push subscription." };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: payload.endpoint,
      p256dh: payload.p256dh,
      auth: payload.auth,
      platform: isIosDevice() ? "ios" : "web",
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" }
  );

  if (error) {
    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function removePushSubscription(subscription: PushSubscription | null) {
  const payload = subscription ? subscriptionPayload(subscription) : null;

  if (!payload) {
    return { error: null as string | null };
  }

  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", payload.endpoint);

  if (error) {
    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function enableWebPush(userId: string) {
  if (!isPushSupported()) {
    return { subscription: null as PushSubscription | null, error: "unsupported" as const };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return { subscription: null as PushSubscription | null, error: "denied" as const };
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  if (!vapidPublicKey) {
    return { subscription: null as PushSubscription | null, error: "missing_vapid" as const };
  }

  const registration = await registerServiceWorker();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const saveResult = await savePushSubscription(userId, subscription);

  if (saveResult.error) {
    return { subscription: null as PushSubscription | null, error: saveResult.error };
  }

  return { subscription, error: null as string | null };
}

export async function showLocalPushNotification(input: {
  title: string;
  body: string;
  href: string;
}) {
  if (!isPushSupported() || Notification.permission !== "granted") {
    return;
  }

  const registration = await navigator.serviceWorker.ready;

  await registration.showNotification(input.title, {
    body: input.body,
    icon: "/globe.svg",
    badge: "/globe.svg",
    data: { href: input.href },
    tag: input.href,
  });
}
