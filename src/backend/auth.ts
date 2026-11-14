/**
 * Inicio de sesión con Google mediante redirección (flujo implícito de OAuth 2.0 para apps
 * web sin servidor). No usa ventanas emergentes, que fallan en apps instaladas en iOS.
 *
 * El token de Google dura ~1 h y este flujo no da token de refresco. Para que la sesión no
 * "caduque" a ojos del usuario, se renueva en silencio: una redirección con `prompt=none`
 * que Google resuelve sin mostrar nada si el usuario sigue con su cuenta abierta en el
 * navegador y ya dio permiso. Solo si eso falla se vuelve a enseñar el botón de inicio.
 */
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email';
const TOKEN_KEY = 'vc-token';
const HINT_KEY = 'vc-hint'; // correo con el que se entró: evita el selector de cuentas
const LOGGED_KEY = 'vc-logged'; // alguna vez se ha iniciado sesión en este dispositivo
const STATE_KEY = 'vc-oauth-state';
const SILENT_KEY = 'vc-oauth-silent';
const SILENT_AT_KEY = 'vc-silent-at';

interface Stored {
  token: string;
  exp: number;
}

export function login(clientId: string, silent = false) {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  if (silent) {
    sessionStorage.setItem(SILENT_KEY, '1');
    sessionStorage.setItem(SILENT_AT_KEY, String(Date.now()));
  } else sessionStorage.removeItem(SILENT_KEY);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: location.origin + location.pathname,
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
  });
  const hint = localStorage.getItem(HINT_KEY);
  if (hint) params.set('login_hint', hint);
  if (silent) params.set('prompt', 'none');
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/**
 * ¿Se puede intentar renovar sin molestar? Sí, si ya se entró alguna vez en este dispositivo
 * y no acabamos de intentarlo (para no entrar en bucle si Google lo rechaza).
 */
export function canRenewSilently(): boolean {
  const last = Number(sessionStorage.getItem(SILENT_AT_KEY) ?? 0);
  return localStorage.getItem(LOGGED_KEY) === '1' && Date.now() - last > 30_000;
}

export interface RedirectResult {
  error: string;
  /** La renovación silenciosa no ha sido posible: hay que pedir inicio de sesión normal */
  silentFailed: boolean;
}

/** Si volvemos de Google con el token en el hash, lo guarda y limpia la URL. */
export function consumeRedirect(): RedirectResult {
  const none = { error: '', silentFailed: false };
  if (!location.hash.includes('access_token') && !location.hash.includes('error=')) return none;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const expected = sessionStorage.getItem(STATE_KEY);
  const silent = sessionStorage.getItem(SILENT_KEY) === '1';
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(SILENT_KEY);
  if (p.get('error')) {
    if (silent) return { error: '', silentFailed: true };
    return { error: `Google ha rechazado el inicio de sesión: ${p.get('error')}`, silentFailed: false };
  }
  if (!expected || p.get('state') !== expected) return { error: 'Respuesta de inicio de sesión no válida.', silentFailed: silent };
  const token = p.get('access_token');
  if (!token) return { error: 'Google no ha devuelto un token.', silentFailed: silent };
  const exp = Date.now() + (Number(p.get('expires_in')) || 3600) * 1000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp } satisfies Stored));
  localStorage.setItem(LOGGED_KEY, '1');
  if (!localStorage.getItem(HINT_KEY)) {
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.email && localStorage.setItem(HINT_KEY, j.email))
      .catch(() => {});
  }
  return none;
}

function stored(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as Stored | null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  const s = stored();
  return s && s.exp - 60_000 > Date.now() ? s.token : null;
}

/** Milisegundos hasta que convenga renovar el token (2 minutos antes de que caduque). */
export function msUntilRenewal(): number | null {
  const s = stored();
  return s ? s.exp - 120_000 - Date.now() : null;
}

export function logout() {
  for (const k of [TOKEN_KEY, HINT_KEY, LOGGED_KEY]) localStorage.removeItem(k);
}
