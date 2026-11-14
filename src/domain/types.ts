export type Role = 'adulto' | 'niño' | 'abuelos';
export const ROLES: Role[] = ['adulto', 'niño', 'abuelos'];

export interface Person {
  name: string;
  role: Role;
  /** Días de teletrabajo habituales: 1 = lunes … 5 = viernes */
  telework: number[];
  /** Mes (1-12) hasta cuyo último día se pueden gastar las vacaciones arrastradas; 0 = sin límite */
  carryMonth: number;
}

export interface Code {
  code: string;
  desc: string;
  role: Role;
  /**
   * Adulto / abuelos: cobertura que aporta (0, 0.5 o 1).
   * Niño: cobertura que necesita (0 = no necesita, 1 = necesita a alguien).
   */
  weight: number;
  color: string;
}

export interface Quota {
  year: number;
  person: string;
  code: string;
  available: number;
}

export type DayType = 'festivo' | 'no lectivo';

export interface SpecialDay {
  from: string; // ISO yyyy-mm-dd
  to: string;
  type: DayType;
  desc: string;
}

/** Bloque de permiso por nacimiento: semanas naturales completas (7 días seguidos cada una). */
export interface LeaveBlock {
  person: string;
  start: string; // ISO
  weeks: number;
  note: string;
}

/** Reglas del permiso por nacimiento y cuidado del menor (editables en la app). */
export interface BirthRules {
  birth: string; // fecha de nacimiento (prevista), ISO o ''
  total: number; // semanas por progenitor
  mandatory: number; // semanas seguidas obligatorias desde el nacimiento
  months: number; // meses en los que hay que disfrutar el resto…
  extra: number; // …salvo estas semanas, que pueden ir más tarde
}

export interface Config {
  people: Person[];
  codes: Code[];
  quotas: Quota[];
  days: SpecialDay[];
  leaves: LeaveBlock[];
  rules: BirthRules;
}

/** persona -> fecha ISO -> código */
export type Grid = Record<string, Record<string, string>>;

export interface CellWrite {
  person: string;
  date: string;
  code: string; // '' = vaciar
}
