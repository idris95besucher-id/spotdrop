export function isDeviceOnline() {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine;
}

export function isLikelyNetworkError(error: unknown) {
  if (!isDeviceOnline()) {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    return (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("failed to fetch") ||
      message.includes("load failed")
    );
  }

  return false;
}
