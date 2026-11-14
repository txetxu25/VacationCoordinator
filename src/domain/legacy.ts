/**
 * Lectura de hojas de año con formato antiguo (las que se rellenaban a mano), para importarlas.
 * Se localiza la fila de cabecera con los días 1, 2, 3… y, en cada fila de datos, el mes
 * (número o nombre, aunque esté abreviado) y la persona en las columnas anteriores.
 */
import { MONTHS, daysInMonth, iso } from './dates';
import type { Grid } from './types';

const norm = (s: string) => (s ?? '').trim().toLowerCase();

function monthOf(cell: string): number {
  const t = norm(cell);
  if (/^\d{1,2}$/.test(t)) return +t >= 1 && +t <= 12 ? +t : 0;
  if (t.length < 3) return 0;
  return MONTHS.findIndex((m) => m.toLowerCase().startsWith(t)) + 1;
}

export interface Legacy {
  /** Nombres tal como aparecen en la hoja, en orden de aparición */
  people: string[];
  grid: Grid;
}

export function parseLegacy(values: string[][], year: number): Legacy {
  let dayCol = -1;
  let headerRow = -1;
  for (let r = 0; r < Math.min(values.length, 10) && dayCol < 0; r++) {
    const row = values[r] ?? [];
    for (let c = 0; c + 2 < row.length; c++) {
      if (norm(row[c]) === '1' && norm(row[c + 1]) === '2' && norm(row[c + 2]) === '3') {
        dayCol = c;
        headerRow = r;
        break;
      }
    }
  }
  if (dayCol < 0) throw new Error('No se reconoce el formato de la hoja: falta la fila con los días 1, 2, 3…');
  const people: string[] = [];
  const grid: Grid = {};
  for (const row of values.slice(headerRow + 1)) {
    const head = row.slice(0, dayCol).map((c) => (c ?? '').trim());
    const month = head.map(monthOf).find((m) => m > 0);
    const person = head.find((c) => c && !monthOf(c));
    if (!month || !person) continue;
    if (!people.includes(person)) people.push(person);
    for (let d = 1; d <= daysInMonth(year, month); d++) {
      const code = (row[dayCol + d - 1] ?? '').trim();
      if (code) (grid[person] ??= {})[iso(year, month, d)] = code;
    }
  }
  return { people, grid };
}

/** Propone a qué persona de la app corresponde cada nombre antiguo (p. ej. "Leo" -> "Leonor"). */
export function guessMapping(legacy: string[], current: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of legacy) {
    const n = norm(name);
    out[name] =
      current.find((c) => norm(c) === n) ??
      current.find((c) => norm(c).startsWith(n) || n.startsWith(norm(c))) ??
      '';
  }
  return out;
}
