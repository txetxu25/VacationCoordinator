import { CODE_CARRY, CODE_HOLIDAY, CODE_NO_SCHOOL, CODE_TELEWORK, CODE_VACATION } from './defaults';
import { daysInMonth, eachDay, isWeekend, iso, weekday } from './dates';
import type { CellWrite, Code, Config, DayType, Grid, Person } from './types';

export const findCode = (config: Config, person: Person, code: string): Code | undefined =>
  config.codes.find((c) => c.role === person.role && c.code === code);

/** Para pintar una celda: si el código no es del rol de la persona, usa el de otro rol (p. ej. F en abuelos). */
export const displayCode = (config: Config, person: Person, code: string): Code | undefined =>
  findCode(config, person, code) ?? config.codes.find((c) => c.code === code);

export const codesFor = (config: Config, person: Person) => config.codes.filter((c) => c.role === person.role);

/** Función "¿es festivo?" para cualquier fecha, según la tabla de días especiales. */
export function holidayChecker(config: Config): (date: string) => boolean {
  const cache = new Map<number, Map<string, { type: DayType }>>();
  return (date) => {
    const y = +date.slice(0, 4);
    if (!cache.has(y)) cache.set(y, specialDays(config, y));
    return cache.get(y)!.get(date)?.type === 'festivo';
  };
}

/** fecha -> festivo / no lectivo de ese año (el festivo gana si coinciden) */
export function specialDays(config: Config, year: number): Map<string, { type: DayType; desc: string }> {
  const map = new Map<string, { type: DayType; desc: string }>();
  for (const sd of config.days) {
    if (sd.to < sd.from) continue;
    for (const date of eachDay(sd.from, sd.to)) {
      if (!date.startsWith(String(year))) continue;
      if (map.get(date)?.type === 'festivo') continue;
      map.set(date, { type: sd.type, desc: sd.desc });
    }
  }
  return map;
}

export interface Coverage {
  need: number;
  cover: number;
  uncovered: boolean;
}

/**
 * Un día laborable está sin cubrir si algún niño necesita a alguien (p. ej. sin cole o enfermo)
 * y la suma de cobertura de adultos y abuelos no llega a 1 (dos medias bajas suman 1).
 */
export function coverage(config: Config, grid: Grid, date: string): Coverage {
  let need = 0;
  let cover = 0;
  if (!isWeekend(date)) {
    for (const p of config.people) {
      const code = grid[p.name]?.[date];
      if (!code) {
        if (atHome(config, p, date)) need = 1;
        continue;
      }
      const w = findCode(config, p, code)?.weight ?? 0;
      if (p.role === 'niño') need = Math.max(need, w);
      else cover += w;
    }
  }
  return { need, cover, uncovered: need > 0 && cover < 1 };
}

const holidayCache = new WeakMap<Config, (date: string) => boolean>();

/**
 * Niño sin nada anotado ese día laborable: está en casa si ya cuenta la regla (desde su fecha de
 * «en casa fuera del cole») y la fecha no cae en ningún periodo de cole o guardería suyo.
 */
export function atHome(config: Config, person: Person, date: string): boolean {
  if (person.role !== 'niño') return false;
  const from = config.careFrom?.[person.name];
  if (!from || date < from || isWeekend(date)) return false;
  if (config.schools?.some((s) => s.person === person.name && s.from <= date && date <= s.to)) return false;
  if (!holidayCache.has(config)) holidayCache.set(config, holidayChecker(config));
  return !holidayCache.get(config)!(date);
}

export function uncoveredDays(config: Config, grid: Grid, year: number, from = ''): string[] {
  const out: string[] = [];
  for (const date of eachDay(iso(year, 1, 1), iso(year, 12, 31))) {
    if (date >= from && coverage(config, grid, date).uncovered) out.push(date);
  }
  return out;
}

export interface Balance {
  code: Code;
  available: number | null;
  /** true si "disponibles" no está tecleado sino calculado (arrastre del año anterior) */
  auto: boolean;
  spent: number; // hasta hoy incluido
  planned: number; // a partir de mañana
  remaining: number | null;
  /** Solo vacaciones arrastradas: último día para gastarlas y días anotados después */
  expiry?: string;
  late?: number;
}

/** Último día para gastar en `year` las vacaciones arrastradas del año anterior ('' = sin límite). */
export const carryExpiry = (person: Person, year: number) =>
  person.carryMonth ? iso(year, person.carryMonth, daysInMonth(year, person.carryMonth)) : '';

/**
 * Saldos de una persona en un año. Si se pasa la rejilla del año anterior y no hay cuota tecleada
 * para las vacaciones arrastradas (VP), se calcula sola: lo que quedó sin gastar de V el año anterior.
 */
export function balances(
  config: Config, grid: Grid, year: number, person: Person, today: string, prevGrid?: Grid,
): Balance[] {
  const count = (g: Grid, y: number, code: string) =>
    Object.entries(g[person.name] ?? {}).filter(([d, c]) => d.startsWith(String(y)) && c === code);
  const quota = (y: number, code: string) =>
    config.quotas.find((x) => x.year === y && x.person === person.name && x.code === code)?.available ?? null;
  return codesFor(config, person).map((code) => {
    const mine = count(grid, year, code.code);
    const spent = mine.filter(([d]) => d <= today).length;
    const planned = mine.length - spent;
    let available = quota(year, code.code);
    let auto = false;
    const b: Balance = { code, available, auto, spent, planned, remaining: null };
    if (code.code === CODE_CARRY && person.role === 'adulto') {
      const prevQuota = quota(year - 1, CODE_VACATION);
      if (available == null && prevGrid && prevQuota != null) {
        available = Math.max(0, prevQuota - count(prevGrid, year - 1, CODE_VACATION).length);
        auto = true;
      }
      const expiry = carryExpiry(person, year);
      if (expiry) {
        b.expiry = expiry;
        b.late = mine.filter(([d]) => d > expiry).length;
      }
    }
    return { ...b, available, auto, remaining: available == null ? null : available - spent - planned };
  });
}

/** Rellena un rango saltando fines de semana y festivos. */
export function rangeWrites(config: Config, person: Person, from: string, to: string, code: string): CellWrite[] {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const single = a === b;
  const special = new Map([...specialDays(config, +a.slice(0, 4)), ...specialDays(config, +b.slice(0, 4))]);
  return eachDay(a, b)
    .filter((d) => single || (!isWeekend(d) && special.get(d)?.type !== 'festivo'))
    .map((date) => ({ person: person.name, date, code }));
}

/** Teletrabajo según el patrón semanal, solo en laborables vacíos. month = 0 para todo el año. */
export function teleworkWrites(config: Config, grid: Grid, year: number, month = 0): CellWrite[] {
  const special = specialDays(config, year);
  const out: CellWrite[] = [];
  for (const p of config.people) {
    if (!p.telework.length || !findCode(config, p, CODE_TELEWORK)) continue;
    for (let m = month || 1; m <= (month || 12); m++) {
      for (let d = 1; d <= daysInMonth(year, m); d++) {
        const date = iso(year, m, d);
        if (special.get(date)?.type === 'festivo' || grid[p.name]?.[date]) continue;
        if (p.telework.includes(weekday(date))) out.push({ person: p.name, date, code: CODE_TELEWORK });
      }
    }
  }
  return out;
}

/** Festivos (F para todos) y no lectivos (VE para los niños), solo en laborables vacíos. */
export function specialDayWrites(config: Config, grid: Grid, year: number, only?: DayType): CellWrite[] {
  const out: CellWrite[] = [];
  for (const [date, sd] of specialDays(config, year)) {
    if (isWeekend(date) || (only && sd.type !== only)) continue;
    for (const p of config.people) {
      if (grid[p.name]?.[date]) continue;
      // Festivo: para todas las personas. No lectivo: solo para los niños.
      if (sd.type === 'festivo') out.push({ person: p.name, date, code: CODE_HOLIDAY });
      else if (p.role === 'niño' && findCode(config, p, CODE_NO_SCHOOL)) out.push({ person: p.name, date, code: CODE_NO_SCHOOL });
    }
  }
  return out;
}
