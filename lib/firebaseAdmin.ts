import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";

let initialized = false;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    return null;
  }
}

export function getFirebaseAdminMessaging() {
  const serviceAccount = parseServiceAccount();

  if (!serviceAccount) {
    return null;
  }

  if (!initialized) {
    if (!getApps().length) {
      initializeApp({
        credential: cert(serviceAccount),
      });
    }

    initialized = true;
  }

  return getMessaging();
}

export function isFcmConfigured() {
  return Boolean(parseServiceAccount());
}
