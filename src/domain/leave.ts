/**
 * Planificador del permiso por nacimiento y cuidado del menor.
 * Se planifica en bloques de semanas naturales completas: cada semana son 7 días seguidos
 * (fines de semana y festivos incluidos), no días laborables sueltos.
 */
import { CODE_BIRTH_LEAVE } from './defaults';
import { addDays, addMonths, eachDay, formatLong, isWeekend } from './dates';
import type { BirthRules, CellWrite, Grid, LeaveBlock } from './types';

export const blockEnd = (b: LeaveBlock) => addDays(b.start, 7 * b.weeks - 1);

const valid = (b: LeaveBlock) => !!b.start && b.weeks > 0;

/** Todos los días naturales de permiso de una persona. */
export function leaveDays(blocks: LeaveBlock[], person: string): Set<string> {
  const days = new Set<string>();
  for (const b of blocks) if (b.person === person && valid(b)) for (const d of eachDay(b.start, blockEnd(b))) days.add(d);
  return days;
}

export interface LeaveAnalysis {
  used: number; // semanas planificadas
  remaining: number;
  warnings: string[];
}

export function analyzeLeave(rules: BirthRules, blocks: LeaveBlock[], person: string): LeaveAnalysis {
  const mine = blocks.filter((b) => b.person === person && valid(b));
  const used = mine.reduce((n, b) => n + b.weeks, 0);
  const days = leaveDays(mine, person);
  const warnings: string[] = [];
  if (used > rules.total) warnings.push(`Hay ${used} semanas planificadas y el máximo es ${rules.total}.`);
  if (days.size !== used * 7) warnings.push('Hay bloques que se solapan entre sí.');
  if (rules.birth && used > 0) {
    let run = 0;
    while (days.has(addDays(rules.birth, run))) run++;
    if (run < rules.mandatory * 7)
      warnings.push(
        `Las ${rules.mandatory} primeras semanas son obligatorias y seguidas desde el nacimiento (${formatLong(rules.birth)}).`,
      );
    if ([...days].some((d) => d < rules.birth)) warnings.push('Hay semanas antes de la fecha de nacimiento.');
    const limit = addMonths(rules.birth, rules.months);
    const late = [...days].filter((d) => d >= limit).length / 7;
    if (late > rules.extra)
      warnings.push(
        `Hay ${Math.ceil(late)} semanas después de los ${rules.months} meses (${formatLong(limit)}); solo ${rules.extra} pueden ir más tarde.`,
      );
  }
  return { used, remaining: rules.total - used, warnings };
}

/**
 * Cambios en la rejilla al pasar de un plan a otro: PN en los laborables de los bloques nuevos
 * y vaciar los PN que ya no pertenecen a ningún bloque.
 */
export function leaveWrites(
  people: string[], before: LeaveBlock[], after: LeaveBlock[], gridOf: (year: number) => Grid,
): CellWrite[] {
  const out: CellWrite[] = [];
  for (const person of people) {
    const oldDays = leaveDays(before, person);
    const newDays = leaveDays(after, person);
    const cell = (d: string) => gridOf(+d.slice(0, 4))[person]?.[d];
    for (const d of newDays) {
      if (!isWeekend(d) && cell(d) !== CODE_BIRTH_LEAVE) out.push({ person, date: d, code: CODE_BIRTH_LEAVE });
    }
    for (const d of oldDays) {
      if (!newDays.has(d) && cell(d) === CODE_BIRTH_LEAVE) out.push({ person, date: d, code: '' });
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
export function timeline(rules: BirthRules, blocks: LeaveBlock[], people: string[]): TimelineWeek[] {
  if (!rules.birth) return [];
  const sets = people.map((p) => leaveDays(blocks, p));
  let last = addMonths(rules.birth, rules.months);
  for (const s of sets) for (const d of s) if (d > last) last = d;
  const weeks: TimelineWeek[] = [];
  for (let start = rules.birth; start <= last && weeks.length < 110; start = addDays(start, 7)) {
    const span = eachDay(start, addDays(start, 6));
    weeks.push({ start, on: sets.map((s) => span.filter((d) => s.has(d)).length >= 4) });
  }
  return weeks;
}
