export type AccentColorCode = "cyan" | "green" | "purple" | "blue";

export type AccentColorOption = {
  code: AccentColorCode;
  label: string;
  primary: string;
  glow: string;
  muted: string;
};

export const DEFAULT_ACCENT_COLOR: AccentColorCode = "cyan";

export const ACCENT_COLOR_OPTIONS: AccentColorOption[] = [
  {
    code: "cyan",
    label: "Cyan",
    primary: "#22d3ee",
    glow: "rgba(34, 211, 238, 0.45)",
    muted: "rgba(34, 211, 238, 0.1)",
  },
  {
    code: "green",
    label: "Green",
    primary: "#10b981",
    glow: "rgba(16, 185, 129, 0.45)",
    muted: "rgba(16, 185, 129, 0.1)",
  },
  {
    code: "purple",
    label: "Purple",
    primary: "#a855f7",
    glow: "rgba(168, 85, 247, 0.45)",
    muted: "rgba(168, 85, 247, 0.1)",
  },
  {
    code: "blue",
    label: "Blue",
    primary: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.45)",
    muted: "rgba(59, 130, 246, 0.1)",
  },
];

const ACCENT_CODES = ACCENT_COLOR_OPTIONS.map((option) => option.code);

export function isAccentColorCode(value: string): value is AccentColorCode {
  return ACCENT_CODES.includes(value as AccentColorCode);
}

export function getAccentColorTheme(code: string | null | undefined): AccentColorOption {
  if (code && isAccentColorCode(code)) {
    return ACCENT_COLOR_OPTIONS.find((option) => option.code === code) ?? ACCENT_COLOR_OPTIONS[0];
  }

  return ACCENT_COLOR_OPTIONS[0];
}

export function applyThemeAccent(code: string | null | undefined) {
  if (typeof document === "undefined") {
    return;
  }

  const theme = getAccentColorTheme(code);
  const root = document.documentElement;

  root.style.setProperty("--sd-primary", theme.primary);
  root.style.setProperty("--sd-accent", theme.primary);
  root.style.setProperty("--sd-primary-glow", theme.glow);
  root.style.setProperty("--sd-accent-muted", theme.muted);
  root.dataset.accent = theme.code;
}

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var raw=localStorage.getItem("spotdrop_user_settings");var accent="cyan";if(raw){var parsed=JSON.parse(raw);if(parsed.accentColor&&["cyan","green","purple","blue"].indexOf(parsed.accentColor)>=0){accent=parsed.accentColor;}}var themes={cyan:["#22d3ee","rgba(34, 211, 238, 0.45)","rgba(34, 211, 238, 0.1)"],green:["#10b981","rgba(16, 185, 129, 0.45)","rgba(16, 185, 129, 0.1)"],purple:["#a855f7","rgba(168, 85, 247, 0.45)","rgba(168, 85, 247, 0.1)"],blue:["#3b82f6","rgba(59, 130, 246, 0.45)","rgba(59, 130, 246, 0.1)"]};var theme=themes[accent]||themes.cyan;var root=document.documentElement;root.style.setProperty("--sd-primary",theme[0]);root.style.setProperty("--sd-accent",theme[0]);root.style.setProperty("--sd-primary-glow",theme[1]);root.style.setProperty("--sd-accent-muted",theme[2]);root.dataset.accent=accent;}catch(e){}})();`;
