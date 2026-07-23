/** Treat null / blank / whitespace-only / clearly-invalid avatar URLs as missing. */
export function normalizeAvatarUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();

  if (!trimmed) {
    return null;
  }

  // Reject obvious non-URL leftovers that would render as a broken <img>.
  const lower = trimmed.toLowerCase();
  if (
    lower === "null" ||
    lower === "undefined" ||
    lower === "none" ||
    lower === "nil" ||
    lower === "-" ||
    lower === "n/a"
  ) {
    return null;
  }

  // Absolute http(s) URLs
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname) {
        return null;
      }
      return trimmed;
    } catch {
      return null;
    }
  }

  // Root-relative public assets (e.g. /icon.png)
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  // data: / blob: URLs from local previews
  if (/^(data|blob):/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/** Lucide UserRound-shaped SVG for imperative DOM markers (Story/profile placeholder). */
export function createAvatarPlaceholderIconElement() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("spotdrop-avatar-placeholder-icon");

  const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  head.setAttribute("cx", "12");
  head.setAttribute("cy", "8");
  head.setAttribute("r", "4");
  svg.appendChild(head);

  const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
  body.setAttribute("d", "M4 20c0-4 3.6-7 8-7s8 3 8 7");
  svg.appendChild(body);

  return svg;
}

/**
 * Fill a DOM container with a profile image, or the shared UserRound placeholder
 * when the URL is missing/invalid or the image fails to load. Never leaves a broken <img>.
 */
export function mountAvatarIntoElement(
  container: HTMLElement,
  url: string | null | undefined,
  options?: { draggable?: boolean }
) {
  const normalized = normalizeAvatarUrl(url);
  container.replaceChildren();

  if (!normalized) {
    container.appendChild(createAvatarPlaceholderIconElement());
    return;
  }

  const probe = new Image();
  probe.onload = () => {
    container.replaceChildren();
    const image = document.createElement("img");
    image.src = normalized;
    image.alt = "";
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.objectFit = "cover";
    image.style.objectPosition = "center";
    if (options?.draggable === false) {
      image.draggable = false;
    }
    container.appendChild(image);
  };
  probe.onerror = () => {
    container.replaceChildren();
    container.appendChild(createAvatarPlaceholderIconElement());
  };
  probe.src = normalized;

  // Show placeholder immediately while probing — never mount a failing <img>.
  container.appendChild(createAvatarPlaceholderIconElement());
}
