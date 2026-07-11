import {
  spotLocationCardCanvasFont,
  type SpotLocationCardFontStyle,
} from "@/lib/spotLocationCardStyles";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { formatSpotGeoLocationShortLabel } from "@/lib/spotLocationDisplay";
import type { I18nLocale } from "@/lib/i18n/locales";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

export type RenderSpotLocationCardInput = {
  cardText: string;
  fontStyle: SpotLocationCardFontStyle;
  locationLabel: string;
};

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    const width = ctx.measureText(next).width;

    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return { lines, lineHeight };
}

function drawPinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(34, 211, 238, 0.95)";
  ctx.fillStyle = "rgba(34, 211, 238, 0.95)";
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(0, size * 0.42);
  ctx.bezierCurveTo(-size * 0.34, -size * 0.08, -size * 0.34, -size * 0.42, 0, -size * 0.42);
  ctx.bezierCurveTo(size * 0.34, -size * 0.42, size * 0.34, -size * 0.08, 0, size * 0.42);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, -size * 0.18, size * 0.11, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export async function renderSpotLocationCardBlob(
  input: RenderSpotLocationCardInput
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to render location card.");
  }

  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, "#0f172a");
  gradient.addColorStop(0.45, "#111827");
  gradient.addColorStop(1, "#050816");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  /** Compact branding, nudged down from the top edge (safe from Dynamic Island crop). */
  const pinSize = 80;
  const pinY = CARD_HEIGHT * 0.155 + 50;
  const logoY = pinY + pinSize * 0.42 + 18;
  /** Footer lifted further so location stays clear of viewer chrome. */
  const footerY = CARD_HEIGHT - 310;
  const footerDividerY = footerY - 44;

  const glow = ctx.createRadialGradient(
    CARD_WIDTH * 0.5,
    pinY,
    32,
    CARD_WIDTH * 0.5,
    pinY,
    CARD_WIDTH * 0.42
  );
  glow.addColorStop(0, "rgba(34, 211, 238, 0.12)");
  glow.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, CARD_WIDTH - 96, CARD_HEIGHT - 96);

  drawPinIcon(ctx, CARD_WIDTH * 0.5, pinY, pinSize);

  ctx.fillStyle = "rgba(203, 213, 225, 0.88)";
  ctx.font = "700 39px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SpotDrop", CARD_WIDTH / 2, logoY);

  const message = input.cardText.trim() || " ";
  spotLocationCardCanvasFont(ctx, input.fontStyle, 54);
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.textAlign = "center";

  const { lines, lineHeight } = wrapCanvasText(ctx, message, CARD_WIDTH - 180, 64);
  /** Sit message just below branding so it owns the visual center. */
  const messageTop = logoY + 52;
  let textY = messageTop + lineHeight * 0.35;

  for (const line of lines.slice(0, 6)) {
    ctx.fillText(line, CARD_WIDTH / 2, textY);
    textY += lineHeight;
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.fillRect(96, footerDividerY, CARD_WIDTH - 192, 1);

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = "500 26px system-ui, -apple-system, sans-serif";
  ctx.fillText("Saved at", CARD_WIDTH / 2, footerY);

  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.font = "600 32px system-ui, -apple-system, sans-serif";
  const locationLines = wrapCanvasText(ctx, input.locationLabel, CARD_WIDTH - 160, 40).lines;

  let locationY = footerY + 40;

  for (const line of locationLines.slice(0, 2)) {
    ctx.fillText(line, CARD_WIDTH / 2, locationY);
    locationY += 40;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to render location card."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      0.92
    );
  });
}

export async function renderSpotLocationCardFile(
  input: RenderSpotLocationCardInput
): Promise<File> {
  const blob = await renderSpotLocationCardBlob(input);
  return new File([blob], `spotdrop-location-${Date.now()}.jpg`, { type: "image/jpeg" });
}

export function formatSpotLocationCardLabel(location: SpotGeoLocation, locale: I18nLocale = "en") {
  return formatSpotGeoLocationShortLabel(location, locale);
}
