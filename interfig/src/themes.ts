// Named color themes, each with a light and a dark palette. Both renderers read these.
export type Palette = {
  accent: string;
  onAccent: string;
  fg: string;
  muted: string;
  bg: string;
  surface: string;
  border: string;
  cardOn: string;
};

export const THEMES: Record<string, { light: Palette; dark: Palette }> = {
  default: {
    light: { accent: '#0074d9', onAccent: '#ffffff', fg: '#111418', muted: '#4b5563', bg: '#ffffff', surface: '#f5f7fa', border: '#b6c0cc', cardOn: '#eef5fd' },
    dark: { accent: '#3396e8', onAccent: '#ffffff', fg: '#e3e3e3', muted: '#9aa0a6', bg: '#1b1b1d', surface: '#242526', border: '#3a3b3c', cardOn: '#1d2733' },
  },
  github: {
    light: { accent: '#0969da', onAccent: '#ffffff', fg: '#1f2328', muted: '#59636e', bg: '#ffffff', surface: '#f6f8fa', border: '#d1d9e0', cardOn: '#ddf4ff' },
    dark: { accent: '#4493f8', onAccent: '#ffffff', fg: '#f0f6fc', muted: '#9198a1', bg: '#0d1117', surface: '#151b23', border: '#3d444d', cardOn: '#0c2d6b' },
  },
  vercel: {
    light: { accent: '#000000', onAccent: '#ffffff', fg: '#171717', muted: '#666666', bg: '#ffffff', surface: '#fafafa', border: '#e5e5e5', cardOn: '#f2f2f2' },
    dark: { accent: '#ededed', onAccent: '#0a0a0a', fg: '#ededed', muted: '#a1a1a1', bg: '#0a0a0a', surface: '#111111', border: '#2e2e2e', cardOn: '#1f1f1f' },
  },
  linear: {
    light: { accent: '#5e6ad2', onAccent: '#ffffff', fg: '#1a1a1e', muted: '#6b6f76', bg: '#ffffff', surface: '#f7f8f8', border: '#dfe1e4', cardOn: '#eef0fc' },
    dark: { accent: '#7c85e8', onAccent: '#ffffff', fg: '#f7f8f8', muted: '#8a8f98', bg: '#08090a', surface: '#141516', border: '#2a2c30', cardOn: '#1b1d3a' },
  },
  contrast: {
    light: { accent: '#0000cc', onAccent: '#ffffff', fg: '#000000', muted: '#1a1a1a', bg: '#ffffff', surface: '#ffffff', border: '#000000', cardOn: '#e6e6ff' },
    dark: { accent: '#ffd400', onAccent: '#000000', fg: '#ffffff', muted: '#e6e6e6', bg: '#000000', surface: '#000000', border: '#ffffff', cardOn: '#332b00' },
  },
};

export const themeNames = () => Object.keys(THEMES);

/** A named theme with any single colors overridden; unknown names fall back to `default`. */
export function palettes(name = 'default', over: Partial<Palette> = {}): { light: Palette; dark: Palette } {
  const t = THEMES[name] ?? THEMES.default;
  return { light: { ...t.light, ...over }, dark: { ...t.dark, ...over } };
}
