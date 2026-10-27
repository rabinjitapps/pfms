/**
 * Appearance settings (light / dark / auto + accent colour), remembered per
 * browser in localStorage. The app's colours are all CSS variables (see
 * app/globals.css), so applying a theme is just setting a data attribute and
 * one custom property on <html>.
 *
 * The same logic is inlined in app/layout.tsx (THEME_BOOT_SCRIPT) so the
 * saved theme is applied before first paint — keep the two in step.
 */

export const THEME_STORAGE_KEY = 'pfms-theme';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeSettings {
  mode: ThemeMode;
  accent: string; // #RRGGBB
}

export const DEFAULT_THEME: ThemeSettings = { mode: 'light', accent: '#1F4D3A' };

export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: 'Ledger Green', value: '#1F4D3A' },
  { name: 'Teal', value: '#0F6B6B' },
  { name: 'Ocean Blue', value: '#1D4E89' },
  { name: 'Indigo', value: '#4338A0' },
  { name: 'Plum', value: '#6D2E5E' },
  { name: 'Slate', value: '#3B4B5C' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Buttons and active nav items use the accent as a background with light text,
 * so a very light custom colour would be unreadable. Darken it until it works.
 */
export function readableAccent(hex: string): string {
  if (!HEX.test(hex)) return DEFAULT_THEME.accent;
  let h = hex.toUpperCase();
  for (let i = 0; i < 8 && luminance(h) > 0.3; i++) {
    const mix = (c: string) =>
      Math.round(parseInt(c, 16) * 0.85)
        .toString(16)
        .padStart(2, '0');
    h = `#${mix(h.slice(1, 3))}${mix(h.slice(3, 5))}${mix(h.slice(5, 7))}`.toUpperCase();
  }
  return h;
}

export function loadTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
    const mode: ThemeMode =
      parsed.mode === 'dark' || parsed.mode === 'system' || parsed.mode === 'light' ? parsed.mode : 'light';
    const accent = parsed.accent && HEX.test(parsed.accent) ? parsed.accent : DEFAULT_THEME.accent;
    return { mode, accent };
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: ThemeSettings): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // storage blocked (private mode etc.) — theme still applies for this visit
  }
}

export function applyTheme(theme: ThemeSettings): void {
  const root = document.documentElement;
  const dark =
    theme.mode === 'dark' ||
    (theme.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.mode = dark ? 'dark' : 'light';
  root.style.setProperty('--accent-base', readableAccent(theme.accent));
}

/** Runs in <head> before paint to avoid a flash of the default theme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem('${THEME_STORAGE_KEY}')||'null');if(!t)return;var d=t.mode==='dark'||(t.mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.mode=d?'dark':'light';if(/^#[0-9a-fA-F]{6}$/.test(t.accent))r.style.setProperty('--accent-base',t.accent);}catch(e){}})();`;
