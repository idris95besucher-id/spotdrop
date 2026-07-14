export type SpotLocationCardFontStyle = "classic" | "bold" | "elegant" | "mono";

export const SPOT_LOCATION_CARD_FONT_STYLES: SpotLocationCardFontStyle[] = [
  "classic",
  "bold",
  "elegant",
  "mono",
];

export type SpotTextCardAlign = "left" | "center" | "right";
export type SpotTextCardFontSize = "sm" | "md" | "lg";

export type SpotTextCardTemplateId =
  | "classic"
  | "dark"
  | "minimal"
  | "neon"
  | "gradient"
  | "nature"
  | "traffic"
  | "emergency"
  | "night"
  | "travel"
  | "modern";

export type SpotTextCardTemplate = {
  id: SpotTextCardTemplateId;
  label: string;
  /** CSS / canvas fill: solid or [from, to] gradient stops */
  background: string | [string, string, string?];
  textColor: string;
  mutedColor: string;
  accentColor: string;
  defaultFont: SpotLocationCardFontStyle;
  defaultAlign: SpotTextCardAlign;
};

/** Display order for the theme picker sheet. */
export const SPOT_TEXT_CARD_TEMPLATES: SpotTextCardTemplate[] = [
  {
    id: "classic",
    label: "Classic SpotDrop",
    background: ["#0f172a", "#111827", "#050816"],
    textColor: "rgba(255,255,255,0.96)",
    mutedColor: "rgba(203,213,225,0.88)",
    accentColor: "rgba(34,211,238,0.95)",
    defaultFont: "classic",
    defaultAlign: "center",
  },
  {
    id: "dark",
    label: "Dark",
    background: ["#09090b", "#18181b"],
    textColor: "#fafafa",
    mutedColor: "rgba(161,161,170,0.9)",
    accentColor: "#a1a1aa",
    defaultFont: "classic",
    defaultAlign: "center",
  },
  {
    id: "minimal",
    label: "Minimal",
    background: "#f8fafc",
    textColor: "#0f172a",
    mutedColor: "#64748b",
    accentColor: "#0ea5e9",
    defaultFont: "classic",
    defaultAlign: "left",
  },
  {
    id: "neon",
    label: "Neon",
    background: ["#0b0618", "#1a0b2e", "#0f172a"],
    textColor: "#f5d0fe",
    mutedColor: "rgba(232,121,249,0.85)",
    accentColor: "#22d3ee",
    defaultFont: "bold",
    defaultAlign: "center",
  },
  {
    id: "gradient",
    label: "Gradient",
    background: ["#7c3aed", "#db2777", "#ea580c"],
    textColor: "#ffffff",
    mutedColor: "rgba(255,255,255,0.78)",
    accentColor: "#fde68a",
    defaultFont: "bold",
    defaultAlign: "center",
  },
  {
    id: "nature",
    label: "Nature",
    background: ["#14532d", "#166534", "#052e16"],
    textColor: "#ecfdf5",
    mutedColor: "rgba(167,243,208,0.85)",
    accentColor: "#4ade80",
    defaultFont: "elegant",
    defaultAlign: "center",
  },
  {
    id: "traffic",
    label: "Traffic",
    background: ["#1c1917", "#292524", "#44403c"],
    textColor: "#fef3c7",
    mutedColor: "rgba(253,230,138,0.8)",
    accentColor: "#f59e0b",
    defaultFont: "bold",
    defaultAlign: "center",
  },
  {
    id: "emergency",
    label: "Emergency",
    background: ["#450a0a", "#7f1d1d", "#1c1917"],
    textColor: "#fee2e2",
    mutedColor: "rgba(252,165,165,0.85)",
    accentColor: "#f87171",
    defaultFont: "bold",
    defaultAlign: "center",
  },
  {
    id: "night",
    label: "Night",
    background: ["#020617", "#0f172a", "#1e1b4b"],
    textColor: "#e0e7ff",
    mutedColor: "rgba(165,180,252,0.85)",
    accentColor: "#818cf8",
    defaultFont: "mono",
    defaultAlign: "center",
  },
  {
    id: "travel",
    label: "Travel",
    background: ["#0c4a6e", "#155e75", "#083344"],
    textColor: "#ecfeff",
    mutedColor: "rgba(165,243,252,0.85)",
    accentColor: "#67e8f9",
    defaultFont: "elegant",
    defaultAlign: "center",
  },
  {
    id: "modern",
    label: "Modern",
    background: ["#111827", "#1f2937", "#0f766e"],
    textColor: "#f8fafc",
    mutedColor: "rgba(148,163,184,0.92)",
    accentColor: "#2dd4bf",
    defaultFont: "classic",
    defaultAlign: "left",
  },
];

export function getSpotTextCardTemplate(id: SpotTextCardTemplateId): SpotTextCardTemplate {
  return SPOT_TEXT_CARD_TEMPLATES.find((template) => template.id === id) ?? SPOT_TEXT_CARD_TEMPLATES[0];
}

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

export function spotTextCardFontSizePx(size: SpotTextCardFontSize) {
  switch (size) {
    case "sm":
      return 42;
    case "lg":
      return 68;
    default:
      return 54;
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
