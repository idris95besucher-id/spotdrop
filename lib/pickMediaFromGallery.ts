/** Gallery picker accept for Story and Add Spot library uploads. */
export const GALLERY_MEDIA_ACCEPT = "image/*,video/*";

export const GALLERY_IMAGE_ACCEPT = "image/*";

export function isIOSDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent;
  const classicIOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return classicIOS || iPadOS;
}

export function applyGalleryFileInputAttributes(
  input: HTMLInputElement,
  accept: string = GALLERY_MEDIA_ACCEPT
) {
  input.type = "file";
  input.accept = accept;
  input.multiple = false;
  // Never add capture here. iOS will show Take Photo or Video / Choose File.
  input.removeAttribute("capture");
  input.removeAttribute("webkitcapture");
}

type PickMediaOptions = {
  accept?: string;
};

/** Programmatic gallery pick (avatar, etc.) — not used on Spot camera. */
export function pickMediaFromGallery(options: PickMediaOptions = {}): Promise<File | null> {
  const accept = options.accept ?? GALLERY_MEDIA_ACCEPT;

  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const input = document.createElement("input");
    applyGalleryFileInputAttributes(input, accept);
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    input.className = "sr-only";

    let settled = false;

    const finish = (file: File | null) => {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener("focus", handleCancel);
      input.remove();
      resolve(file);
    };

    const handleCancel = () => {
      window.setTimeout(() => {
        if (!settled && !input.files?.length) {
          finish(null);
        }
      }, 500);
    };

    input.addEventListener(
      "change",
      () => {
        finish(input.files?.[0] ?? null);
      },
      { once: true }
    );

    document.body.appendChild(input);
    window.addEventListener("focus", handleCancel, { once: true });

    window.requestAnimationFrame(() => {
      input.click();
    });
  });
}

export function pickImageFromGallery(): Promise<File | null> {
  return pickMediaFromGallery({ accept: GALLERY_IMAGE_ACCEPT });
}
