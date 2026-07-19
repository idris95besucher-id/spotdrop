import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
import { pushServerError, pushServerLog } from "@/lib/pushServerLog";

let initialized = false;
let initError: string | null = null;
let loggedMissingEnv = false;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (!raw) {
    if (!loggedMissingEnv) {
      loggedMissingEnv = true;
      pushServerError("fcm-init", "FIREBASE_SERVICE_ACCOUNT_JSON missing/empty");
    }
    return null;
  }

  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch (error) {
    initError = error instanceof Error ? error.message : String(error);
    pushServerError("fcm-init", "FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON", {
      error: initError,
      jsonLength: raw.length,
      startsWith: raw.slice(0, 20),
    });
    return null;
  }
}

export function getFirebaseAdminMessaging() {
  const serviceAccount = parseServiceAccount();

  if (!serviceAccount) {
    return null;
  }

  const sa = serviceAccount as ServiceAccount & {
    project_id?: string;
    client_email?: string;
    projectId?: string;
    clientEmail?: string;
  };

  if (!initialized) {
    try {
      if (!getApps().length) {
        initializeApp({
          credential: cert(serviceAccount),
        });
        pushServerLog("fcm-init", "firebase-admin initializeApp OK", {
          projectId: sa.project_id ?? sa.projectId ?? null,
          clientEmail: sa.client_email ?? sa.clientEmail ?? null,
        });
      } else {
        pushServerLog("fcm-init", "firebase-admin app already initialized");
      }
      initialized = true;
      initError = null;
    } catch (error) {
      initError = error instanceof Error ? error.message : String(error);
      pushServerError("fcm-init", "firebase-admin initializeApp failed", { error: initError });
      return null;
    }
  }

  try {
    return getMessaging();
  } catch (error) {
    pushServerError("fcm-init", "getMessaging() failed", {
      error: error instanceof Error ? error.message : String(error),
      initError,
    });
    return null;
  }
}

export function isFcmConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}

export function getFirebaseAdminInitError() {
  return initError;
}
