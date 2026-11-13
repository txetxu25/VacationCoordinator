export type Role = 'adulto' | 'niño' | 'abuelos';
export const ROLES: Role[] = ['adulto', 'niño', 'abuelos'];

export interface Person {
  name: string;
  role: Role;
  /** Días de teletrabajo habituales: 1 = lunes … 5 = viernes */
  telework: number[];
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

export interface Config {
  people: Person[];
  codes: Code[];
  quotas: Quota[];
  days: SpecialDay[];
}

/** persona -> fecha ISO -> código */
export type Grid = Record<string, Record<string, string>>;

export interface CellWrite {
  person: string;
  date: string;
  code: string; // '' = vaciar
}
