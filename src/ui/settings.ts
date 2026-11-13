export interface Settings {
  mode: 'google' | 'demo' | '';
  clientId: string;
  spreadsheetId: string;
}

const KEY = 'vc-settings';

export function loadSettings(): Settings {
  const base: Settings = {
    mode: '',
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
    spreadsheetId: '',
  };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Admite el enlace completo de la hoja o solo su identificador. */
export function spreadsheetIdFrom(input: string): string {
  const m = /\/d\/([a-zA-Z0-9_-]+)/.exec(input);
  return m ? m[1] : input.trim();
}
