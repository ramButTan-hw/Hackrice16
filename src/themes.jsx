import { useEffect, useRef, useState } from 'react';

const themes = [
  { id: 'sage', name: 'Sage', swatch: '#bac6a2' },
  { id: 'sand', name: 'Sand', swatch: '#d4bda0' },
  { id: 'clay', name: 'Clay', swatch: '#cba99b' },
  { id: 'mauve', name: 'Mauve', swatch: '#bfa9b9' },
];
const defaults = { theme: 'sage', opacity: 94 };

export function useTheme() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ui.appearance'));
      return {
        theme: themes.some(t => t.id === saved?.theme) ? saved.theme : defaults.theme,
        opacity: Number.isFinite(saved?.opacity) ? Math.min(98, Math.max(86, saved.opacity)) : defaults.opacity,
      };
    } catch { return defaults; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--glass-opacity', settings.opacity / 100);
    try { localStorage.setItem('ui.appearance', JSON.stringify(settings)); } catch {}
  }, [settings]);
  return [settings, setSettings];
}

export function ThemePicker({ settings, onChange }) {
  const panel = useRef(null);
  useEffect(() => {
    function dismiss(event) {
      if (!panel.current?.contains(event.target) && panel.current) panel.current.open = false;
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return <details className="theme-picker" ref={panel} onKeyDown={event => {
    if (event.key === 'Escape') { panel.current.open = false; panel.current.querySelector('summary').focus(); }
  }}>
    <summary className="icon-button" aria-label="Customize theme" title="Customize theme">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" stroke="none"/></svg>
    </summary>
    <div className="theme-popover">
      <fieldset><legend>Theme</legend><div className="theme-options">
        {themes.map(theme => <button type="button" key={theme.id} aria-pressed={settings.theme === theme.id} onClick={() => onChange({ ...settings, theme: theme.id })}>
          <span className="theme-swatch" style={{ background: theme.swatch }} aria-hidden="true">{settings.theme === theme.id ? '✓' : ''}</span>{theme.name}
        </button>)}
      </div></fieldset>
      <label className="opacity-label" htmlFor="glass-opacity">Glass opacity <output htmlFor="glass-opacity">{settings.opacity}%</output></label>
      <input id="glass-opacity" type="range" min="86" max="98" step="1" value={settings.opacity} onChange={event => onChange({ ...settings, opacity: Number(event.target.value) })}/>
    </div>
  </details>;
}
