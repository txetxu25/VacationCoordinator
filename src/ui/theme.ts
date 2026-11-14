/** Apariencia de la app. Se guarda en cada dispositivo, no en la hoja. */
export type Theme = 'claro' | 'oscuro' | 'sistema';
export const THEMES: Theme[] = ['claro', 'oscuro', 'sistema'];

const KEY = 'vc-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function getTheme(): Theme {
  const t = localStorage.getItem(KEY) as Theme | null;
  return t && THEMES.includes(t) ? t : 'sistema';
}

export function applyTheme(theme = getTheme()) {
  const dark = theme === 'oscuro' || (theme === 'sistema' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

// En modo «sistema», seguir los cambios del dispositivo (p. ej. el modo oscuro automático de noche)
media.addEventListener('change', () => applyTheme());
