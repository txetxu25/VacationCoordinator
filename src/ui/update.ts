/**
 * Actualización automática: al abrir la app (o volver a ella) se mira si hay una versión publicada
 * más nueva. Si la hay y no hay cambios sin guardar, se recarga sola; si no, se avisa.
 */
declare const __BUILD__: string;
export const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
const TRIED = 'vc-updated-to';

export async function newerBuild(): Promise<string | null> {
  if (BUILD === 'dev') return null;
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const { build } = (await res.json()) as { build?: string };
    return build && build !== BUILD ? build : null;
  } catch {
    return null;
  }
}

/**
 * Recarga pidiendo la página con una dirección distinta para saltarse la caché del navegador
 * (GitHub Pages deja guardar la página unos minutos). Devuelve false si ya se intentó con esa
 * versión y sigue saliendo la vieja, para no entrar en bucle.
 */
export function reloadTo(build: string, force = false): boolean {
  if (!force && sessionStorage.getItem(TRIED) === build) return false;
  sessionStorage.setItem(TRIED, build);
  location.replace(`${location.pathname}?v=${build}${location.hash}`);
  return true;
}
