import type { Person } from '../domain/types';

/** Color propio de cada persona (por orden en la lista), para avatares y etiquetas. */
const PALETTE = ['#4f86e8', '#ef8354', '#9a6bd8', '#26a17a', '#d9a82c', '#d9577c', '#3fa9c4', '#8a8f2e'];
export const personColor = (people: Person[], name: string) => PALETTE[Math.max(0, people.findIndex((p) => p.name === name)) % PALETTE.length];

export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
};

export function Avatar({ people, name, size = 30 }: { people: Person[]; name: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: personColor(people, name), width: size, height: size, fontSize: size * 0.4 }} aria-hidden>
      {initials(name)}
    </span>
  );
}

const paths: Record<string, string> = {
  calendario: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 8h2m3 0h2m-7 4h2m3 0h2',
  año: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z',
  saldos: 'M5 20V11M10 20V5M15 20v-7M20 20V8M3 20h18',
  ajustes: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
};

export function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}
