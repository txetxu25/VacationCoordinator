/**
 * Formato de las hojas que gestiona la app.
 *
 * Hoja de año ("2027"):
 *   fila 1:  Mes | Persona | 1 | 2 | … | 31            (columnas A..AG)
 *   después: un bloque por mes con una fila por persona; cada celda, un código.
 *   A partir de la columna AI hay un resumen con fórmulas (solo lectura para la app).
 *
 * Hoja "Config": seis tablas, una al lado de otra, con cabecera en la fila 1.
 *   A-D personas · E-I códigos · K-N cuotas · P-S días especiales · U-X permiso por nacimiento · Y-Z ajustes
 */
import { MONTHS, WEEKDAYS, daysInMonth, iso, parseDate } from './dates';
import { DEFAULT_RULES } from './defaults';
import type {
  BirthRules, Code, Config, DayType, Grid, LeaveBlock, Person, Quota, Role, SpecialDay,
} from './types';

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

/** Columna inicial de cada tabla de la hoja Config (todas caben en A..Z). */
const COL = { people: 0, codes: 4, quotas: 10, days: 15, leaves: 20, rules: 24 };

const RULE_KEYS: [keyof BirthRules, string][] = [
  ['birth', 'Nacimiento'],
  ['total', 'PN semanas'],
  ['mandatory', 'PN obligatorias'],
  ['months', 'PN meses'],
  ['extra', 'PN semanas posteriores'],
];

export function serializeConfig(c: Config): string[][] {
  const blocks: [number, string[][]][] = [
    [
      COL.people,
      [
        ['Persona', 'Rol', 'Teletrabajo', 'VP hasta mes'],
        ...c.people.map((p) => [p.name, p.role, teleworkToText(p.telework), p.carryMonth ? String(p.carryMonth) : '']),
      ],
    ],
    [
      COL.codes,
      [
        ['Código', 'Descripción', 'Rol', 'Cobertura', 'Color'],
        ...c.codes.map((x) => [x.code, x.desc, x.role, String(x.weight), x.color]),
      ],
    ],
    [
      COL.quotas,
      [
        ['Año', 'Persona', 'Código', 'Disponibles'],
        ...c.quotas.map((x) => [String(x.year), x.person, x.code, String(x.available)]),
      ],
    ],
    [COL.days, [['Desde', 'Hasta', 'Tipo', 'Descripción'], ...c.days.map((d) => [d.from, d.to, d.type, d.desc])]],
    [
      COL.leaves,
      [
        ['PN persona', 'PN inicio', 'PN semanas', 'PN nota'],
        ...c.leaves.map((l) => [l.person, l.start, String(l.weeks), l.note]),
      ],
    ],
    [COL.rules, [['Ajuste', 'Valor'], ...RULE_KEYS.map(([k, label]) => [label, String(c.rules[k])])]],
  ];
  const height = Math.max(...blocks.map(([, b]) => b.length));
  const out: string[][] = Array.from({ length: height }, () => Array(COL.rules + 2).fill(''));
  for (const [col, block] of blocks) block.forEach((row, r) => row.forEach((v, i) => (out[r][col + i] = v)));
  return out;
}

export function parseConfig(values: string[][]): Config {
  const people: Person[] = [];
  const codes: Code[] = [];
  const quotas: Quota[] = [];
  const days: SpecialDay[] = [];
  const leaves: LeaveBlock[] = [];
  const rules: BirthRules = { ...DEFAULT_RULES };
  for (const raw of values.slice(1)) {
    const v = (i: number) => (raw[i] ?? '').trim();
    if (v(0)) {
      const cm = parseNum(v(3));
      people.push({
        name: v(0), role: parseRole(v(1)), telework: textToTelework(v(2)),
        carryMonth: Number.isInteger(cm) && cm >= 1 && cm <= 12 ? cm : 0,
      });
    }
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
    const start = parseDate(v(21));
    const weeks = parseNum(v(22));
    if (v(20) && start && weeks > 0) leaves.push({ person: v(20), start, weeks: Math.round(weeks), note: v(23) });
    const rule = RULE_KEYS.find(([, label]) => norm(label) === norm(v(24)));
    if (rule) {
      if (rule[0] === 'birth') rules.birth = parseDate(v(25)) ?? '';
      else if (v(25) !== '' && Number.isFinite(parseNum(v(25)))) rules[rule[0]] = parseNum(v(25));
    }
  }
  return { people, codes, quotas, days, leaves, rules };
}
