export type SpotLocationCardFontStyle = "classic" | "bold" | "elegant" | "mono";

export const SPOT_LOCATION_CARD_FONT_STYLES: SpotLocationCardFontStyle[] = [
  "classic",
  "bold",
  "elegant",
  "mono",
];

export function spotLocationCardFontCss(style: SpotLocationCardFontStyle) {
  switch (style) {
    case "bold":
      return "font-bold tracking-tight";
    case "elegant":
      return "font-normal italic font-serif";
    case "mono":
      return "font-medium font-mono tracking-wide";
    default:
      return "font-medium";
  }
}

export function spotLocationCardCanvasFont(
  ctx: CanvasRenderingContext2D,
  style: SpotLocationCardFontStyle,
  size: number
) {
  switch (style) {
    case "bold":
      ctx.font = `700 ${size}px system-ui, -apple-system, sans-serif`;
      break;
    case "elegant":
      ctx.font = `italic 400 ${size}px Georgia, "Times New Roman", serif`;
      break;
    case "mono":
      ctx.font = `500 ${Math.round(size * 0.82)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      break;
    default:
      ctx.font = `500 ${size}px system-ui, -apple-system, sans-serif`;
      break;
  }
}
