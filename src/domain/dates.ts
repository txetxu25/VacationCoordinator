export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = (n: number) => String(n).padStart(2, '0');

export const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** m es 1..12 */
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 1 = lunes … 7 = domingo */
export const weekday = (date: string) => ((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;

export const isWeekend = (date: string) => weekday(date) >= 6;

export const parts = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
};

export function todayIso(): string {
  const n = new Date();
  return iso(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** Acepta yyyy-mm-dd o d/m/yyyy (como lo muestra Sheets en español). */
export function parseDate(s: string): string | null {
  const t = (s ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return iso(y, mo, d);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(to + 'T00:00:00Z').getTime();
  for (let t = new Date(from + 'T00:00:00Z').getTime(); t <= end; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function addDays(date: string, n: number): string {
  return new Date(new Date(date + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
}

export function addMonths(date: string, n: number): string {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function formatLong(date: string): string {
  const { y, m, d } = parts(date);
  return `${d} ${MONTHS[m - 1].slice(0, 3).toLowerCase()} ${y}`;
}

export function formatShort(date: string): string {
  const { m, d } = parts(date);
  return `${WEEKDAYS[weekday(date) - 1]} ${d} ${MONTHS[m - 1].slice(0, 3).toLowerCase()}`;
}
