const PROFILE_GALLERY_AVATAR_PULSE_KEY = "spotdrop:profile-gallery-avatar-pulse-seen";

export function hasSeenProfileGalleryAvatarPulse() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(PROFILE_GALLERY_AVATAR_PULSE_KEY) === "1";
}

export function markProfileGalleryAvatarPulseSeen() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PROFILE_GALLERY_AVATAR_PULSE_KEY, "1");
}
