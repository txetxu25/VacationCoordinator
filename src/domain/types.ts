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

export type LeaveUnit = 'semanas' | 'días naturales' | 'días laborables';
export const LEAVE_UNITS: LeaveUnit[] = ['semanas', 'días naturales', 'días laborables'];

/** Un permiso de una persona (cada empresa tiene los suyos): duración, código y reglas opcionales. */
export interface LeaveType {
  person: string;
  name: string;
  /** Código que se anota en el calendario */
  code: string;
  /** Código para media jornada ('' si este permiso no la admite) */
  halfCode: string;
  unit: LeaveUnit;
  amount: number; // duración total, en la unidad
  /** Reglas ligadas al nacimiento; 0 = no aplica */
  mandatory: number; // unidades seguidas obligatorias desde el nacimiento
  months: number; // meses desde el nacimiento para disfrutarlo…
  extra: number; // …salvo estas unidades, que pueden ir más tarde
}

/** Bloque planificado de un permiso. Una semana son 7 días seguidos desde el día de inicio. */
export interface LeaveBlock {
  person: string;
  type: string; // nombre del permiso
  start: string; // ISO
  amount: number; // en la unidad del permiso
  /** A media jornada: dura lo mismo en el calendario pero consume la mitad */
  half: boolean;
  note: string;
}

export interface Config {
  people: Person[];
  codes: Code[];
  quotas: Quota[];
  days: SpecialDay[];
  leaveTypes: LeaveType[];
  leaves: LeaveBlock[];
  /** Fecha de nacimiento (prevista), ISO o '' */
  birth: string;
  /** Periodos en que cada niño está en el cole o la guardería (cubiertos en principio) */
  schools: SchoolPeriod[];
  /**
   * Por niño: desde qué fecha cuenta la regla «fuera del cole o la guardería está en casa».
   * Sin fecha, el niño solo necesita a alguien los días con código (como hasta ahora).
   */
  careFrom: Record<string, string>;
}

export interface SchoolPeriod {
  person: string;
  from: string; // ISO
  to: string; // ISO
}

/** persona -> fecha ISO -> código */
export type Grid = Record<string, Record<string, string>>;

export interface CellWrite {
  person: string;
  date: string;
  code: string; // '' = vaciar
}
