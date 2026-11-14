/**
 * Planificador de permisos (nacimiento y los que tenga cada empresa).
 * Cada persona tiene sus propios permisos, con su duración, unidad y código de calendario.
 * Un permiso en semanas se planifica en semanas naturales completas: 7 días seguidos desde
 * el día de inicio, sea cual sea (p. ej. de jueves a miércoles).
 */
import { addDays, addMonths, eachDay, formatLong, isWeekend } from './dates';
import type { CellWrite, Grid, LeaveBlock, LeaveType } from './types';

export interface Plan {
  types: LeaveType[];
  blocks: LeaveBlock[];
}
export type IsHoliday = (date: string) => boolean;

const noHoliday: IsHoliday = () => false;

/** Días que ocupa un bloque: naturales, o solo laborables si el permiso va en días laborables. */
export function blockDates(b: LeaveBlock, t: LeaveType, isHoliday: IsHoliday = noHoliday): string[] {
  if (!b.start || !(b.amount > 0)) return [];
  if (t.unit === 'días laborables') {
    const out: string[] = [];
    for (let d = b.start; out.length < Math.ceil(b.amount) && out.length < 400; d = addDays(d, 1)) {
      if (!isWeekend(d) && !isHoliday(d)) out.push(d);
      if (d > addDays(b.start, 800)) break;
    }
    return out;
  }
  const n = Math.ceil(t.unit === 'semanas' ? b.amount * 7 : b.amount);
  return eachDay(b.start, addDays(b.start, n - 1));
}

export const blockEnd = (b: LeaveBlock, t: LeaveType, isHoliday?: IsHoliday) => blockDates(b, t, isHoliday).pop() ?? b.start;

/** Lo que consume un bloque de la duración del permiso: a media jornada, la mitad. */
export const blockUse = (b: LeaveBlock) => (b.half ? b.amount / 2 : b.amount);

const typeOf = (plan: Plan, b: LeaveBlock) => plan.types.find((t) => t.person === b.person && t.name === b.type);

/** fecha -> código de calendario, para todos los permisos de una persona. */
export function planDays(plan: Plan, person: string, isHoliday?: IsHoliday): Map<string, string> {
  const days = new Map<string, string>();
  for (const b of plan.blocks) {
    const t = b.person === person ? typeOf(plan, b) : undefined;
    if (!t) continue;
    const code = b.half && t.halfCode ? t.halfCode : t.code;
    for (const d of blockDates(b, t, isHoliday)) days.set(d, code);
  }
  return days;
}

/** ¿Se pisan entre sí los bloques de una persona? */
export function hasOverlap(plan: Plan, person: string, isHoliday?: IsHoliday): boolean {
  let total = 0;
  for (const b of plan.blocks) {
    const t = b.person === person ? typeOf(plan, b) : undefined;
    if (t) total += blockDates(b, t, isHoliday).length;
  }
  return total !== planDays(plan, person, isHoliday).size;
}

export interface LeaveAnalysis {
  used: number;
  remaining: number;
  warnings: string[];
}

export function analyzeLeave(birth: string, t: LeaveType, blocks: LeaveBlock[], isHoliday?: IsHoliday): LeaveAnalysis {
  const mine = blocks.filter((b) => b.person === t.person && b.type === t.name && b.start && b.amount > 0);
  const used = mine.reduce((n, b) => n + blockUse(b), 0);
  const warnings: string[] = [];
  if (used > t.amount) warnings.push(`Lo planificado suma ${fmt(used)} ${t.unit} y el máximo es ${fmt(t.amount)}.`);
  if (mine.some((b) => b.half) && !t.halfCode) warnings.push('Hay bloques a media jornada y este permiso no tiene código de media jornada.');
  const birthRules = t.mandatory > 0 || t.months > 0;
  if (birth && birthRules && used > 0) {
    const perUnit = t.unit === 'semanas' ? 7 : 1;
    const days = new Set(mine.flatMap((b) => blockDates(b, t, isHoliday)));
    if (t.mandatory > 0 && t.unit !== 'días laborables') {
      const full = new Set(mine.filter((b) => !b.half).flatMap((b) => blockDates(b, t, isHoliday)));
      let run = 0;
      while (full.has(addDays(birth, run))) run++;
      if (run < t.mandatory * perUnit)
        warnings.push(
          `Las ${fmt(t.mandatory)} primeras ${t.unit} son obligatorias, seguidas y a jornada completa desde el nacimiento (${formatLong(birth)}).`,
        );
    }
    if ([...days].some((d) => d < birth)) warnings.push('Hay días antes de la fecha de nacimiento.');
    if (t.months > 0) {
      const limit = addMonths(birth, t.months);
      const late = mine.reduce((n, b) => {
        const dates = blockDates(b, t, isHoliday);
        return n + (dates.length ? (dates.filter((d) => d >= limit).length / dates.length) * blockUse(b) : 0);
      }, 0);
      if (late > t.extra + 1e-9)
        warnings.push(
          `Hay ${fmt(late)} ${t.unit} después de los ${t.months} meses (${formatLong(limit)}); solo ${fmt(t.extra)} pueden ir más tarde.`,
        );
    }
  }
  return { used, remaining: t.amount - used, warnings };
}

export const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * Cambios en la rejilla al pasar de un plan a otro: anota el código de cada permiso en los
 * laborables de sus bloques y vacía lo que el plan anterior había anotado y ya no corresponde.
 */
export function leaveWrites(
  people: string[], before: Plan, after: Plan, gridOf: (year: number) => Grid, isHoliday?: IsHoliday,
): CellWrite[] {
  const out: CellWrite[] = [];
  for (const person of people) {
    const oldDays = planDays(before, person, isHoliday);
    const newDays = planDays(after, person, isHoliday);
    const cell = (d: string) => gridOf(+d.slice(0, 4))[person]?.[d];
    for (const [d, code] of newDays) {
      if (code && !isWeekend(d) && cell(d) !== code) out.push({ person, date: d, code });
    }
    for (const [d, code] of oldDays) {
      if (!newDays.has(d) && code && cell(d) === code) out.push({ person, date: d, code: '' });
    }
  }
  return out;
}

export interface TimelineWeek {
  start: string;
  /** por persona, en el mismo orden que `people`: si está de permiso esa semana (4 días o más) */
  on: boolean[];
}

/** Semanas desde el nacimiento, para ver de un vistazo solapes y huecos entre progenitores. */
export function timeline(birth: string, plan: Plan, people: string[], isHoliday?: IsHoliday, months = 12): TimelineWeek[] {
  if (!birth) return [];
  const sets = people.map((p) => planDays(plan, p, isHoliday));
  let last = addMonths(birth, months);
  for (const s of sets) for (const d of s.keys()) if (d > last) last = d;
  const weeks: TimelineWeek[] = [];
  for (let start = birth; start <= last && weeks.length < 110; start = addDays(start, 7)) {
    const span = eachDay(start, addDays(start, 6));
    weeks.push({ start, on: sets.map((s) => span.filter((d) => s.has(d)).length >= 4) });
  }
  return weeks;
}
