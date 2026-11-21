/**
 * Festivos de Madrid capital para un año sin lista oficial precargada: se calculan las fechas
 * habituales (nacionales, autonómicos, locales y Semana Santa). Los traslados de los que caen en
 * domingo y los cambios que decida cada año la Comunidad no se pueden calcular: van marcados.
 */
import { addDays, iso, weekday } from './dates';
import type { SpecialDay } from './types';

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
export function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

export function computedMadridHolidays(year: number): SpecialDay[] {
  const e = easter(year);
  const list: [string, string][] = [
    [iso(year, 1, 1), 'Año Nuevo'],
    [iso(year, 1, 6), 'Epifanía'],
    [addDays(e, -3), 'Jueves Santo'],
    [addDays(e, -2), 'Viernes Santo'],
    [iso(year, 5, 1), 'Fiesta del Trabajo'],
    [iso(year, 5, 2), 'Comunidad de Madrid'],
    [iso(year, 5, 15), 'San Isidro (local)'],
    [iso(year, 8, 15), 'Asunción'],
    [iso(year, 10, 12), 'Fiesta Nacional'],
    [iso(year, 11, 1), 'Todos los Santos'],
    [iso(year, 11, 9), 'La Almudena (local)'],
    [iso(year, 12, 6), 'Constitución'],
    [iso(year, 12, 8), 'Inmaculada'],
    [iso(year, 12, 25), 'Navidad'],
  ];
  return list.map(([date, name]) => ({
    from: date,
    to: date,
    type: 'festivo' as const,
    desc: `${name} (calculado${weekday(date) === 7 ? '; cae en domingo, revisar traslado' : ''})`,
  }));
}
