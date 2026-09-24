// Dashboard palette. Mirrors src/app/globals.css tokens.
// Light: cool slate. Dark: navy. Brand: cyan.

export const COLORS = {
  primary: {
    DEFAULT: "#0891B2",
    hover: "#0E7490",
    light: "#22D3EE",
    dark: "#155E75",
  },

  light: {
    bg: "#F4F7F8",
    bgAlt: "#E7EEEF",
    surface: "#FFFFFF",
    sidebar: "#E7EEEF",
    border: "#D5DEE2",
    textMain: "#0a0a0a",
    textMuted: "#6B7280",
  },

  dark: {
    bg: "#0B1220",
    bgAlt: "#0E1728",
    surface: "#121A2B",
    sidebar: "#0E1728",
    border: "#243044",
    textMain: "#E6EDF3",
    textMuted: "#93A4B8",
  },

  status: {
    success: "#0F766E",
    successLight: "#CCFBF1",
    successDark: "#115E59",
    warning: "#B45309",
    warningLight: "#FEF3C7",
    warningDark: "#92400E",
    error: "#cf222e",
    errorLight: "#FEE2E2",
    errorDark: "#991B1B",
    info: "#0891B2",
    infoLight: "#CFFAFE",
    infoDark: "#155E75",
  },
};

export const CSS_VARIABLES = {
  light: {
    "--color-primary": COLORS.primary.DEFAULT,
    "--color-primary-hover": COLORS.primary.hover,
    "--color-bg": COLORS.light.bg,
    "--color-bg-alt": COLORS.light.bgAlt,
    "--color-surface": COLORS.light.surface,
    "--color-sidebar": COLORS.light.sidebar,
    "--color-border": COLORS.light.border,
    "--color-text-main": COLORS.light.textMain,
    "--color-text-muted": COLORS.light.textMuted,
  },
  dark: {
    "--color-primary": COLORS.primary.DEFAULT,
    "--color-primary-hover": COLORS.primary.hover,
    "--color-bg": COLORS.dark.bg,
    "--color-bg-alt": COLORS.dark.bgAlt,
    "--color-surface": COLORS.dark.surface,
    "--color-sidebar": COLORS.dark.sidebar,
    "--color-border": COLORS.dark.border,
    "--color-text-main": COLORS.dark.textMain,
    "--color-text-muted": COLORS.dark.textMuted,
  },
};
