/**
 * Formato de las hojas que gestiona la app.
 *
 * Hoja de año ("2027"):
 *   fila 1:  Mes | Persona | 1 | 2 | … | 31            (columnas A..AG)
 *   después: un bloque por mes con una fila por persona; cada celda, un código.
 *   A partir de la columna AI hay un resumen con fórmulas (solo lectura para la app).
 *
 * Hoja "Config": cuatro tablas, una al lado de otra, con cabecera en la fila 1.
 *   A-C personas · E-I códigos · K-N cuotas · P-S días especiales
 */
import { MONTHS, WEEKDAYS, daysInMonth, iso, parseDate } from './dates';
import type { Code, Config, DayType, Grid, Person, Quota, Role, SpecialDay } from './types';

export const YEAR_HEADER = ['Mes', 'Persona'];
export const GRID_COLS = 33; // A..AG
export const SUMMARY_COL = 34; // AI

export function colLetter(idx: number): string {
  let s = '';
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export const isAppYearSheet = (values: string[][]) =>
  values[0]?.[0] === YEAR_HEADER[0] && values[0]?.[1] === YEAR_HEADER[1];

const norm = (s: string) => (s ?? '').trim().toLowerCase();

function monthIndex(s: string): number {
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  return MONTHS.findIndex((m) => norm(m) === norm(s)) + 1; // 0 si no encaja
}

export interface YearData {
  grid: Grid;
  /** `${mes}|${persona}` -> índice de fila (0 = cabecera) */
  rows: Map<string, number>;
}

export function parseYear(values: string[][], year: number): YearData {
  const grid: Grid = {};
  const rows = new Map<string, number>();
  for (let r = 1; r < values.length; r++) {
    const row = values[r] ?? [];
    const m = monthIndex(row[0] ?? '');
    const person = (row[1] ?? '').trim();
    if (!m || !person) continue;
    rows.set(`${m}|${person}`, r);
    const max = daysInMonth(year, m);
    for (let d = 1; d <= max; d++) {
      const code = (row[1 + d] ?? '').trim();
      if (code) (grid[person] ??= {})[iso(year, m, d)] = code;
    }
  }
  return { grid, rows };
}

export function buildYear(year: number, config: Config, grid: Grid): string[][] {
  const { people, codes } = config;
  const out: string[][] = [[...YEAR_HEADER, ...Array.from({ length: 31 }, (_, i) => String(i + 1))]];
  for (let m = 1; m <= 12; m++) {
    const max = daysInMonth(year, m);
    for (const p of people) {
      const row = [MONTHS[m - 1], p.name];
      for (let d = 1; d <= 31; d++) row.push(d <= max ? grid[p.name]?.[iso(year, m, d)] ?? '' : '');
      out.push(row);
    }
  }
  // Resumen con fórmulas, para poder consultar recuentos desde la propia hoja.
  const last = out.length;
  const q = (s: string) => s.replace(/"/g, '""');
  const summary: string[][] = [['Persona', 'Código', 'Descripción', 'Recuento']];
  for (const p of people) {
    for (const c of codes.filter((c) => c.role === p.role)) {
      summary.push([
        p.name,
        c.code,
        c.desc,
        `=SUMPRODUCT(($B$2:$B$${last}="${q(p.name)}")*($C$2:$AG$${last}="${q(c.code)}"))`,
      ]);
    }
  }
  summary.forEach((s, i) => {
    const row = (out[i] ??= []);
    while (row.length < SUMMARY_COL) row.push('');
    row.push(...s);
  });
  return out;
}

// ---------- Config ----------

const ROLE_ALIASES: Record<string, Role> = {
  adulto: 'adulto', adulta: 'adulto', padre: 'adulto', madre: 'adulto',
  niño: 'niño', niña: 'niño', nino: 'niño', nina: 'niño', hijo: 'niño', hija: 'niño',
  abuelos: 'abuelos', abuelo: 'abuelos', abuela: 'abuelos',
};
const parseRole = (s: string): Role => ROLE_ALIASES[norm(s)] ?? 'adulto';
const parseNum = (s: string) => Number(String(s ?? '').replace(',', '.'));

export const teleworkToText = (days: number[]) => days.map((d) => WEEKDAYS[d - 1]).join(',');
export const textToTelework = (s: string) =>
  [...new Set((s ?? '').toUpperCase().split(/[\s,;]+/).map((x) => WEEKDAYS.indexOf(x) + 1))]
    .filter((d) => d >= 1 && d <= 5)
    .sort();

export function serializeConfig(c: Config): string[][] {
  const blocks: string[][][] = [
    [['Persona', 'Rol', 'Teletrabajo'], ...c.people.map((p) => [p.name, p.role, teleworkToText(p.telework)])],
    [
      ['Código', 'Descripción', 'Rol', 'Cobertura', 'Color'],
      ...c.codes.map((x) => [x.code, x.desc, x.role, String(x.weight), x.color]),
    ],
    [
      ['Año', 'Persona', 'Código', 'Disponibles'],
      ...c.quotas.map((x) => [String(x.year), x.person, x.code, String(x.available)]),
    ],
    [['Desde', 'Hasta', 'Tipo', 'Descripción'], ...c.days.map((d) => [d.from, d.to, d.type, d.desc])],
  ];
  const height = Math.max(...blocks.map((b) => b.length));
  const out: string[][] = [];
  for (let r = 0; r < height; r++) {
    const row: string[] = [];
    blocks.forEach((b, i) => {
      const width = b[0].length;
      row.push(...(b[r] ?? Array(width).fill('')));
      if (i < blocks.length - 1) row.push('');
    });
    out.push(row);
  }
  return out;
}

export function parseConfig(values: string[][]): Config {
  const people: Person[] = [];
  const codes: Code[] = [];
  const quotas: Quota[] = [];
  const days: SpecialDay[] = [];
  for (const raw of values.slice(1)) {
    const v = (i: number) => (raw[i] ?? '').trim();
    if (v(0)) people.push({ name: v(0), role: parseRole(v(1)), telework: textToTelework(v(2)) });
    if (v(4)) {
      const w = parseNum(v(7));
      codes.push({
        code: v(4), desc: v(5), role: parseRole(v(6)),
        weight: Number.isFinite(w) ? w : 0,
        color: /^#[0-9a-f]{6}$/i.test(v(8)) ? v(8) : '#dddddd',
      });
    }
    if (v(10) && v(11) && v(12)) {
      const y = parseNum(v(10)), a = parseNum(v(13));
      if (Number.isFinite(y) && Number.isFinite(a) && v(13) !== '')
        quotas.push({ year: y, person: v(11), code: v(12), available: a });
    }
    const from = parseDate(v(15));
    if (from) {
      const type: DayType = norm(v(17)).startsWith('no') ? 'no lectivo' : 'festivo';
      days.push({ from, to: parseDate(v(16)) ?? from, type, desc: v(18) });
    }
  }
  return { people, codes, quotas, days };
}
