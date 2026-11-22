import { WEEKDAYS, addDays, formatShort, isWeekend, parts, weekday } from '../domain/dates';
import { atHome, coverage, displayCode, specialDays } from '../domain/logic';
import type { Store } from '../store';
import { Avatar } from './look';

const DAYS = 14;

/** Las dos próximas semanas: quién está fuera, qué niños están en casa y qué falta por cubrir. */
export function Upcoming({ store, today, onGo }: { store: Store; today: string; onGo: (date: string) => void }) {
  const { config } = store;
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const missing = [...new Set(dates.map((d) => parts(d).y))].filter((y) => !store.years.includes(y));
  const special = new Map([...new Set(dates.map((d) => parts(d).y))].flatMap((y) => [...specialDays(config, y)]));
  const rows = dates.map((date) => {
    const grid = store.grid(parts(date).y);
    const cov = coverage(config, grid, date);
    const kids = config.people
      .filter((p) => p.role === 'niño')
      .map((p) => {
        const c = grid[p.name]?.[date];
        const def = c ? displayCode(config, p, c) : undefined;
        if (def && def.weight > 0) return { p, label: def.desc, color: def.color };
        if (!c && atHome(config, p, date)) return { p, label: 'En casa', color: '' };
        return null;
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
  const gaps = rows.filter((r) => r.cov.uncovered);

  return (
    <div className="cards upcoming">
      <div className={gaps.length ? 'banner' : 'banner ok'}>
        {gaps.length ? (
          <strong>
            <span className="bicon" aria-hidden>!</span>
            {gaps.length} {gaps.length === 1 ? 'día sin cubrir' : 'días sin cubrir'} en las próximas dos semanas
          </strong>
        ) : (
          <><span className="bicon" aria-hidden>✓</span>Todo cubierto las próximas dos semanas.</>
        )}
      </div>
      {missing.length > 0 && <p className="warn inline">Falta la hoja de {missing.join(' y ')}: esos días aparecen vacíos.</p>}
      <section className="card daylist">
        {rows.map((r) => {
          const we = isWeekend(r.date);
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
                {r.sd && <span className="tag">{r.sd.type === 'festivo' ? 'Festivo' : 'Sin cole'}: {r.sd.desc}</span>}
                {!we && r.kids.map((k) => (
                  <span key={k.p.name} className="tag kidtag">
                    <Avatar people={config.people} name={k.p.name} size={18} /> <b>{k.p.name}</b> {k.label.toLowerCase()}
                  </span>
                ))}
                {r.away.map((a) => (
                  <span key={a.p.name} className="tag">
                    <Avatar people={config.people} name={a.p.name} size={18} /> <b>{a.p.name}</b>
                    <i style={{ background: a.def.color }}>{a.def.code}</i> {a.def.desc.toLowerCase()}
                  </span>
                ))}
                {!we && !r.sd && !r.kids.length && !r.away.length && <span className="quiet">Día normal</span>}
              </span>
              {!we && r.cov.need > 0 && (
                <span className={`dstate${r.cov.uncovered ? ' bad' : ''}`}>{r.cov.uncovered ? 'Sin cubrir' : 'Cubierto'}</span>
              )}
            </button>
          );
        })}
      </section>
      <p className="muted center-text">Toca un día para abrirlo en el calendario.</p>
    </div>
  );
}
