/**
 * Design tokens taken from the Figma file "Infant Band App — Key Screens".
 * The file has no Figma variables, so these values were read from the layers.
 * Action colours were then re-based on the NeoBridge logo (assets/brand/neobridge-logo-original.png).
 *
 * Rules from the design:
 * - The brand purple is for actions only, never for a status.
 * - Status colours step in lightness (yellow lightest, grey, red, green darkest)
 *   and each status also has its own shape, so colour is never the only signal.
 */

export const brand = {
  name: "NeoBridge",
  tagline: "Newborn warmth band for families, ASHAs and doctors",
  /** Logo purple. Too light for white text (3.7:1), so use for marks and accents only. */
  lavender: "#8378dd",
  /** Baby in the logo. Accents only — never near a status colour. */
  coral: "#fc9283",
  /** "Bridge" in the wordmark */
  slate: "#414857",
} as const;

export const color = {
  // surfaces
  background: "#f5f4f2",
  surface: "#ffffff",
  border: "#dedbd6",
  track: "#ecebe8",

  // text
  text: "#1c1b19",
  textSecondary: "#57544f",
  textMuted: "#6a665f",

  // actions (brand purple; white text on `action` is 6.3:1)
  action: "#5b4fc4",
  actionStrong: "#4b3fa8",
  actionSoft: "#eceafb",
  actionOnDark: "#dcd8f7",

  night: "#2d3047",
} as const;

export type Status = "green" | "yellow" | "red" | "grey";

export const status = {
  green: {
    fill: "#125c38",
    heading: "#0e4a2d",
    panel: "#e3f0e7",
    caption: "#4d5e53",
  },
  yellow: {
    fill: "#f2b01e",
    strong: "#b07d00",
    panel: "#fff2cc",
    caption: "#5e5440",
  },
  red: {
    fill: "#d23a31",
    strong: "#b52e26",
    text: "#a82820",
    soft: "#fbe5e3",
  },
  grey: {
    fill: "#8e8a83",
    panel: "#ecebe8",
  },
} as const satisfies Record<Status, Record<string, string>>;

export const font = {
  /** Headlines. Drawn for Devanagari and Latin. */
  heading: "Baloo 2",
  /** Body text. Drawn for Devanagari and Latin. */
  body: "Mukta",
} as const;

/** Hindi lines need at least 1.3 line height. */
export const minLineHeight = 1.3;

export const radius = {
  chip: 999,
  card: 22,
  panel: 28,
  button: 24,
  tile: 18,
} as const;

export const size = {
  /** Minimum touch target (Android guidance). */
  touchMin: 48,
  callButton: 76,
  callButtonUrgent: 96,
  tabBar: 84,
  listenButton: 64,
  screenGutter: 16,
} as const;
