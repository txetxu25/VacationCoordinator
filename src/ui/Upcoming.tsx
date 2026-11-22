import { WEEKDAYS, addDays, formatShort, isWeekend, parts, weekday } from '../domain/dates';
import { coverage, displayCode, specialDays } from '../domain/logic';
import type { Store } from '../store';
import { Avatar } from './look';

const DAYS = 7;

/** Cuadro con los próximos 7 días: quién está fuera, qué niño necesita a alguien y si está cubierto. */
export function Upcoming({ store, today, onGo }: { store: Store; today: string; onGo: (date: string) => void }) {
  const { config } = store;
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const years = [...new Set(dates.map((d) => parts(d).y))];
  const special = new Map(years.flatMap((y) => [...specialDays(config, y)]));
  const rows = dates.map((date) => {
    const grid = store.grid(parts(date).y);
    const cov = coverage(config, grid, date);
    const kids = config.people
      .filter((p) => p.role === 'niño')
      .map((p) => {
        const c = grid[p.name]?.[date];
        const def = c ? displayCode(config, p, c) : undefined;
        return def && def.weight > 0 && c !== 'F' ? { p, def } : null;
      })
      .filter((x) => x !== null);
    const away = config.people
      .filter((p) => p.role !== 'niño')
      .map((p) => {
        const c = grid[p.name]?.[date];
        const def = c ? displayCode(config, p, c) : undefined;
        return def && c !== 'F' ? { p, def } : null;
      })
      .filter((x) => x !== null);
    return { date, cov, kids, away, sd: special.get(date) };
  });

  return (
    <section className="card daylist">
      <h2 className="dlhead">Próximos 7 días</h2>
      {rows.map((r) => {
        const we = isWeekend(r.date);
        const tags = [...r.kids, ...r.away];
        return (
          <button
            key={r.date}
            className={`dayrow${we ? ' we' : ''}${r.cov.uncovered ? ' bad' : ''}${r.date === today ? ' now' : ''}`}
            onClick={() => onGo(r.date)}
          >
            <span className="dwhen">
              <b>{r.date === today ? 'Hoy' : r.date === addDays(today, 1) ? 'Mañana' : WEEKDAYS[weekday(r.date) - 1]}</b>
              <small>{formatShort(r.date).slice(2)}</small>
            </span>
            <span className="dwhat">
              {r.sd?.type === 'festivo' && <span className="tag">Festivo: {r.sd.desc}</span>}
              {tags.map(({ p, def }) => (
                <span key={p.name} className={`tag${p.role === 'niño' ? ' kidtag' : ''}`}>
                  <Avatar people={config.people} name={p.name} size={18} /> <b>{p.name}</b>
                  <i style={{ background: def.color }}>{def.code}</i>
                </span>
              ))}
              {!we && !r.sd && !tags.length && <span className="quiet">Día normal</span>}
            </span>
            {!we && r.cov.need > 0 && (
              <span className={`dstate${r.cov.uncovered ? ' bad' : ''}`}>{r.cov.uncovered ? 'Sin cubrir' : 'Cubierto'}</span>
            )}
          </button>
        );
      })}
    </section>
  );
}
