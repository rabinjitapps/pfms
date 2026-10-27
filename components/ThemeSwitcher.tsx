'use client';

import { useEffect, useState } from 'react';
import {
  ACCENT_PRESETS,
  DEFAULT_THEME,
  ThemeMode,
  ThemeSettings,
  applyTheme,
  loadTheme,
  readableAccent,
  saveTheme,
} from '@/lib/theme';
import styles from './ThemeSwitcher.module.css';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
];

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeSettings>(DEFAULT_THEME);

  // Read the saved theme after mount (localStorage isn't available during SSR)
  useEffect(() => {
    setTheme(loadTheme());
  }, []);

  // In Auto mode, follow the OS setting live
  useEffect(() => {
    if (theme.mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(theme);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  function update(next: ThemeSettings) {
    // Store the readable (possibly darkened) accent so the pre-paint boot
    // script applies exactly what the user sees here.
    const stored = { ...next, accent: readableAccent(next.accent) };
    setTheme(stored);
    saveTheme(stored);
    applyTheme(stored);
  }

  const currentAccent = theme.accent.toUpperCase();
  const isPreset = ACCENT_PRESETS.some((p) => p.value.toUpperCase() === currentAccent);

  return (
    <div className={styles.wrap}>
      <button
        className={styles.toggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="theme-panel"
      >
        <span className={styles.dot} style={{ background: 'var(--ledger-green)' }} />
        Theme
        <span className={styles.chevron} data-open={open}>▸</span>
      </button>

      {open && (
        <div id="theme-panel" className={styles.panel}>
          <div className={styles.group}>
            <span className={styles.label}>Appearance</span>
            <div className={styles.segmented} role="group" aria-label="Appearance">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  className={theme.mode === m.value ? styles.segActive : styles.seg}
                  onClick={() => update({ ...theme, mode: m.value })}
                  aria-pressed={theme.mode === m.value}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.group}>
            <span className={styles.label}>Accent colour</span>
            <div className={styles.swatches}>
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.value}
                  className={currentAccent === p.value.toUpperCase() ? styles.swatchActive : styles.swatch}
                  style={{ background: p.value }}
                  onClick={() => update({ ...theme, accent: p.value })}
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={currentAccent === p.value.toUpperCase()}
                />
              ))}
              <label
                className={!isPreset ? styles.customActive : styles.custom}
                title="Pick any colour"
                style={!isPreset ? { background: currentAccent } : undefined}
              >
                <input
                  type="color"
                  className={styles.colorInput}
                  value={currentAccent}
                  onChange={(e) => update({ ...theme, accent: e.target.value })}
                  aria-label="Custom accent colour"
                />
                {isPreset && <span aria-hidden="true">+</span>}
              </label>
            </div>
          </div>

          <button className={styles.reset} onClick={() => update(DEFAULT_THEME)}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
}
