export {
  saveUserPushToken,
  removeUserPushToken,
  saveFcmDeviceToken,
  removeFcmDeviceToken,
  PUSH_TOKEN_TABLES,
  type PushPlatform,
} from "@/lib/userPushTokens";

/** @deprecated Use PushPlatform */
export type FcmPlatform = import("@/lib/userPushTokens").PushPlatform;
