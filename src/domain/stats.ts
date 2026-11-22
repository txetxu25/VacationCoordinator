/**
 * Estadísticas para la pestaña Saldos: reparto de días por tipo, saldos frente a lo disponible
 * y quién ha cubierto los días en que algún niño necesitaba a alguien.
 */
import { CODE_HOLIDAY, CODE_TELEWORK } from './defaults';
import { addDays, isWeekend } from './dates';
import { coverage, findCode, specialDays } from './logic';
import type { Code, Config, Grid, Person } from './types';

export interface CodeCount {
  code: Code;
  spent: number; // hasta hoy incluido
  planned: number; // después de hoy
}

/** Días de cada código de una persona en el año (sin festivos). */
export function codeCounts(config: Config, grid: Grid, year: number, person: Person, today: string): CodeCount[] {
  const out = new Map<string, CodeCount>();
  for (const [date, c] of Object.entries(grid[person.name] ?? {})) {
    if (!date.startsWith(String(year)) || c === CODE_HOLIDAY) continue;
    const code = findCode(config, person, c) ?? config.codes.find((x) => x.code === c);
    if (!code) continue;
    const e = out.get(c) ?? { code, spent: 0, planned: 0 };
    if (date <= today) e.spent++;
    else e.planned++;
    out.set(c, e);
  }
  return [...out.values()].sort((a, b) => b.spent + b.planned - (a.spent + a.planned));
}

/** Códigos que son "estar malo": bajas y enfermedades, por su descripción. */
export const isSick = (c: Code) => /baja|enferm|malo/i.test(c.desc);
/** Códigos que no son ausencia (teletrabajo y los que no cubren ni necesitan, salvo enfermedad). */
export const isAbsence = (c: Code, role: Person['role']) => role !== 'adulto' || c.code !== CODE_TELEWORK;

export interface Coverer {
  key: string; // persona adulta o código de abuelo
  label: string;
  color: string;
  person?: string;
  spent: number;
  planned: number;
}

/**
 * Días laborables (no festivos) en que algún niño necesitaba a alguien, y quién los cubrió.
 * Cada adulto suma lo que cubre su código (1 o 0,5); cada abuelo cuenta por su código (A1, A2…).
 */
export function coverers(config: Config, grid: Grid, year: number, today: string) {
  const special = specialDays(config, year);
  const map = new Map<string, Coverer>();
  let needed = 0;
  let uncovered = 0;
  for (const [date, list] of datesOf(grid, year)) {
    if (isWeekend(date) || special.get(date)?.type === 'festivo') continue;
    const cov = coverage(config, grid, date);
    if (!cov.need) continue;
    if (config.people.some((p) => p.role === 'niño' && grid[p.name]?.[date] === CODE_HOLIDAY)) continue;
    needed++;
    if (cov.uncovered) uncovered++;
    for (const p of config.people) {
      if (p.role === 'niño') continue;
      const c = list.get(p.name);
      const code = c ? findCode(config, p, c) : undefined;
      if (!code || !(code.weight > 0) || code.code === CODE_HOLIDAY) continue;
      const key = p.role === 'abuelos' ? `${p.name}|${code.code}` : p.name;
      const e = map.get(key) ?? {
        key, label: p.role === 'abuelos' ? code.desc : p.name, color: p.role === 'abuelos' ? code.color : '',
        person: p.role === 'abuelos' ? undefined : p.name, spent: 0, planned: 0,
      };
      if (date <= today) e.spent += code.weight;
      else e.planned += code.weight;
      map.set(key, e);
    }
  }
  const list = [...map.values()].sort((a, b) => b.spent + b.planned - (a.spent + a.planned));
  return { needed, uncovered, list };
}

/** fecha -> (persona -> código) del año, solo fechas con algo anotado. */
function datesOf(grid: Grid, year: number): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const [person, cells] of Object.entries(grid)) {
    for (const [date, code] of Object.entries(cells)) {
      if (!date.startsWith(String(year))) continue;
      if (!out.has(date)) out.set(date, new Map());
      out.get(date)!.set(person, code);
    }
  }
  return out;
}

const absenceCodeOf = (config: Config, person: Person, c: string | undefined) => {
  if (!c || c === CODE_HOLIDAY) return undefined;
  const code = findCode(config, person, c) ?? config.codes.find((x) => x.code === c);
  return code && isAbsence(code, person.role) ? code : undefined;
};

/** Días de ausencia por mes (sin festivos ni teletrabajo). */
export function monthly(config: Config, grid: Grid, year: number, person: Person, today: string) {
  const out = Array.from({ length: 12 }, () => ({ spent: 0, planned: 0 }));
  for (const [date, c] of Object.entries(grid[person.name] ?? {})) {
    if (!date.startsWith(String(year)) || !absenceCodeOf(config, person, c)) continue;
    const m = +date.slice(5, 7) - 1;
    if (date <= today) out[m].spent++;
    else out[m].planned++;
  }
  return out;
}

/**
 * Próxima ausencia a partir de mañana: el tramo seguido con el mismo código (los fines de semana
 * y festivos intermedios no lo cortan). `gridOf` da la rejilla de cada año.
 */
export function nextAbsence(config: Config, gridOf: (y: number) => Grid, person: Person, today: string) {
  const at = (d: string) => gridOf(+d.slice(0, 4))[person.name]?.[d];
  let d = addDays(today, 1);
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) {
    const code = absenceCodeOf(config, person, at(d));
    if (!code) continue;
    let end = d;
    let days = 0;
    for (let e = d, gap = 0; gap < 5; e = addDays(e, 1)) {
      if (at(e) === code.code) { end = e; days++; gap = 0; }
      else if (isWeekend(e) || at(e) === CODE_HOLIDAY) gap++;
      else break;
    }
    return { code, from: d, to: end, days, inDays: Math.round((Date.parse(d) - Date.parse(today)) / 86400000) };
  }
  return undefined;
}
