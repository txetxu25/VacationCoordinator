/**
 * Inicio de sesión con Google mediante redirección (flujo implícito de OAuth 2.0 para apps
 * web sin servidor). No usa ventanas emergentes, que fallan en apps instaladas en iOS.
 * El token dura ~1 h; al caducar se vuelve a pedir con otra redirección.
 */
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_KEY = 'vc-token';
const STATE_KEY = 'vc-oauth-state';

interface Stored {
  token: string;
  exp: number;
}

export function login(clientId: string) {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: location.origin + location.pathname,
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
  });
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/** Si volvemos de Google con el token en el hash, lo guarda y limpia la URL. Devuelve un error o ''. */
export function consumeRedirect(): string {
  if (!location.hash.includes('access_token') && !location.hash.includes('error=')) return '';
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (p.get('error')) return `Google ha rechazado el inicio de sesión: ${p.get('error')}`;
  if (!expected || p.get('state') !== expected) return 'Respuesta de inicio de sesión no válida.';
  const token = p.get('access_token');
  if (!token) return 'Google no ha devuelto un token.';
  const exp = Date.now() + (Number(p.get('expires_in')) || 3600) * 1000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp } satisfies Stored));
  return '';
}

export function getToken(): string | null {
  try {
    const s = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as Stored | null;
    return s && s.exp - 60_000 > Date.now() ? s.token : null;
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}
