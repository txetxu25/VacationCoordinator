import { computedMadridHolidays } from './holidays';
import type { Code, Config, SpecialDay } from './types';

/** Códigos con significado fijo para la app (el resto son libres y se editan en Ajustes). */
export const CODE_TELEWORK = 'T';
export const CODE_HOLIDAY = 'F';
export const CODE_NO_SCHOOL = 'VE';
export const CODE_VACATION = 'V';
export const CODE_CARRY = 'VP';
export const CODE_BIRTH_LEAVE = 'PN';

/**
 * Permiso por nacimiento del régimen general (art. 48.4 ET tras el RDL 9/2025): 19 semanas,
 * 6 obligatorias desde el nacimiento, el resto en 12 meses salvo 2 que pueden ir hasta los 8 años.
 */
export const STANDARD_BIRTH_LEAVE = { unit: 'semanas' as const, amount: 19, mandatory: 6, months: 12, extra: 2 };

export const DEFAULT_CODES: Code[] = [
  { code: 'V', desc: 'Vacaciones', role: 'adulto', weight: 1, color: '#8fd19e' },
  { code: 'VP', desc: 'Vacaciones año anterior', role: 'adulto', weight: 1, color: '#b9e4c1' },
  { code: 'C', desc: 'Cierre de empresa', role: 'adulto', weight: 1, color: '#8fd3c8' },
  { code: 'P', desc: 'Permiso', role: 'adulto', weight: 1, color: '#ffcf8a' },
  { code: 'CM', desc: 'Cuidado de menor', role: 'adulto', weight: 1, color: '#f6a5c0' },
  { code: 'PN', desc: 'Permiso por nacimiento', role: 'adulto', weight: 1, color: '#d3a4e0' },
  { code: 'B', desc: 'Baja (día completo)', role: 'adulto', weight: 1, color: '#f2a09c' },
  { code: 'MB', desc: 'Media baja (medio día)', role: 'adulto', weight: 0.5, color: '#fbd3d0' },
  { code: 'T', desc: 'Teletrabajo', role: 'adulto', weight: 0, color: '#bcdcf7' },
  { code: 'F', desc: 'Festivo', role: 'adulto', weight: 1, color: '#dcdcdc' },
  { code: 'VE', desc: 'Sin cole (vacaciones / no lectivo)', role: 'niño', weight: 1, color: '#fff3a0' },
  { code: 'E', desc: 'Enfermo', role: 'niño', weight: 1, color: '#ff9d7a' },
  { code: 'CP', desc: 'Campamento', role: 'niño', weight: 0, color: '#b5ecf3' },
  { code: 'F', desc: 'Festivo', role: 'niño', weight: 1, color: '#dcdcdc' },
  { code: 'A1', desc: 'Abuelo/a 1', role: 'abuelos', weight: 1, color: '#d9c8bf' },
  { code: 'A2', desc: 'Abuelo/a 2', role: 'abuelos', weight: 1, color: '#c9b6e0' },
  { code: 'A3', desc: 'Abuelo/a 3', role: 'abuelos', weight: 1, color: '#c5d8a4' },
  { code: 'F', desc: 'Festivo', role: 'abuelos', weight: 0, color: '#dcdcdc' },
];

const f = (date: string, desc: string): SpecialDay => ({ from: date, to: date, type: 'festivo', desc });
const nl = (from: string, to: string, desc: string): SpecialDay => ({ from, to, type: 'no lectivo', desc });

/**
 * Madrid capital. Festivos: decretos de fiestas laborales de la Comunidad de Madrid.
 * Los locales de 2027 y los no lectivos están tomados de prensa: revisar contra BOCM / el centro.
 */
const MADRID: Record<number, SpecialDay[]> = {
  2026: [
    f('2026-01-01', 'Año Nuevo'),
    f('2026-01-06', 'Epifanía'),
    f('2026-04-02', 'Jueves Santo'),
    f('2026-04-03', 'Viernes Santo'),
    f('2026-05-01', 'Fiesta del Trabajo'),
    f('2026-05-15', 'San Isidro (local)'),
    f('2026-10-12', 'Fiesta Nacional'),
    f('2026-11-02', 'Todos los Santos (trasladado)'),
    f('2026-11-09', 'La Almudena (local)'),
    f('2026-12-07', 'Constitución (trasladado)'),
    f('2026-12-08', 'Inmaculada'),
    f('2026-12-25', 'Navidad'),
  ],
  2027: [
    f('2027-01-01', 'Año Nuevo'),
    f('2027-01-06', 'Epifanía'),
    f('2027-03-19', 'San José'),
    f('2027-03-25', 'Jueves Santo'),
    f('2027-03-26', 'Viernes Santo'),
    f('2027-08-16', 'Asunción (trasladado)'),
    f('2027-10-12', 'Fiesta Nacional'),
    f('2027-11-01', 'Todos los Santos'),
    f('2027-11-09', 'La Almudena (local, sin confirmar)'),
    f('2027-12-06', 'Constitución'),
    f('2027-12-08', 'Inmaculada'),
    nl('2027-01-04', '2027-01-08', 'Navidad (sin confirmar)'),
    nl('2027-02-12', '2027-02-15', 'No lectivos febrero (sin confirmar)'),
    nl('2027-03-22', '2027-03-29', 'Semana Santa (sin confirmar)'),
    nl('2027-06-21', '2027-08-31', 'Verano (inicio curso 27-28 pendiente)'),
  ],
};

/** Festivos y no lectivos precargados de un año ([] si no los hay). */
export const madridDays = (year: number): SpecialDay[] =>
  MADRID[year] ? MADRID[year].map((d) => ({ ...d })) : computedMadridHolidays(year);
/** ¿Hay lista revisada para ese año, o solo calculada? */
export const hasOfficialDays = (year: number) => !!MADRID[year];
export const MADRID_DAYS: SpecialDay[] = [...MADRID[2026], ...MADRID[2027]].map((d) => ({ ...d }));

export function defaultConfig(): Config {
  return {
    people: [
      { name: 'Niño 1', role: 'niño', telework: [], carryMonth: 0 },
      { name: 'Niño 2', role: 'niño', telework: [], carryMonth: 0 },
      { name: 'Adulto 1', role: 'adulto', telework: [], carryMonth: 0 },
      { name: 'Adulto 2', role: 'adulto', telework: [], carryMonth: 0 },
      { name: 'Abuelos', role: 'abuelos', telework: [], carryMonth: 0 },
    ],
    codes: DEFAULT_CODES.map((c) => ({ ...c })),
    quotas: [],
    days: MADRID_DAYS.map((d) => ({ ...d })),
    leaveTypes: [],
    leaves: [],
    birth: '',
    schools: [],
    careFrom: {},
  };
}
