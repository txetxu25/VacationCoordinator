import { useState } from 'react';
import { WEEKDAYS, daysInMonth, formatShort, isWeekend, iso, weekday } from '../domain/dates';
import { codesFor, coverage, displayCode, rangeWrites, specialDays, uncoveredDays } from '../domain/logic';
import type { CellWrite, Person } from '../domain/types';
import type { Store } from '../store';
import type { Run } from './App';

interface Props {
  store: Store;
  year: number;
  month: number;
  today: string;
  onGo: (date: string) => void;
  run: Run;
}

export function Calendar({ store, year, month, today, onGo, run }: Props) {
  const [pick, setPick] = useState<{ person: Person; date: string } | null>(null);
  const { config } = store;
  const grid = store.grid(year);
  const special = specialDays(config, year);
  const pending = uncoveredDays(config, grid, year, today);
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => iso(year, month, i + 1));

  return (
    <>
      {pending.length > 0 ? (
        <div className="banner">
          <strong>
            {pending.length} {pending.length === 1 ? 'día sin cubrir' : 'días sin cubrir'}
          </strong>
          <div className="chips">
            {pending.slice(0, 12).map((d) => (
              <button key={d} onClick={() => onGo(d)}>
                {formatShort(d)}
              </button>
            ))}
            {pending.length > 12 && <span>y {pending.length - 12} más</span>}
          </div>
        </div>
      ) : (
        <div className="banner ok">Todo cubierto de aquí a fin de año.</div>
      )}

      <table className="cal">
        <thead>
          <tr>
            <th />
            {config.people.map((p) => (
              <th key={p.name}>{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((date) => {
            const weekend = isWeekend(date);
            const cov = coverage(config, grid, date);
            const sd = special.get(date);
            const cls = [weekend && 'weekend', cov.uncovered && 'uncovered', date === today && 'today']
              .filter(Boolean)
              .join(' ');
            return (
              <tr key={date} className={cls}>
                <th title={sd?.desc}>
                  <span className="wd">{WEEKDAYS[weekday(date) - 1]}</span> {+date.slice(8)}
                  {cov.uncovered && <span className="alert" aria-label="Sin cubrir"> !</span>}
                </th>
                {config.people.map((p) => {
                  const code = grid[p.name]?.[date] ?? '';
                  const def = code ? displayCode(config, p, code) : undefined;
                  return (
                    <td key={p.name}>
                      <button
                        className="cell"
                        style={code ? { background: def?.color ?? '#ddd' } : undefined}
                        title={def?.desc}
                        aria-label={`${p.name}, ${formatShort(date)}${code ? `: ${def?.desc ?? code}` : ''}`}
                        onClick={() => setPick({ person: p, date })}
                      >
                        {code}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="legend">
        {config.codes
          .filter((c, i, all) => all.findIndex((x) => x.code === c.code) === i)
          .map((c) => (
            <span key={c.code}>
              <i style={{ background: c.color }}>{c.code}</i> {c.desc}
            </span>
          ))}
      </div>

      {pick && (
        <Picker
          store={store}
          person={pick.person}
          date={pick.date}
          current={grid[pick.person.name]?.[pick.date] ?? ''}
          note={special.get(pick.date)?.desc}
          onClose={() => setPick(null)}
          onApply={(writes) => {
            setPick(null);
            run(() => store.setCells(writes));
          }}
        />
      )}
    </>
  );
}

/**
 * Elegir código y periodo. Primero se marca el código, se ajustan las fechas si es un periodo
 * y se pulsa «Aplicar»; debajo se ve a cuántos días afecta y qué pasa con lo ya anotado.
 */
function Picker(props: {
  store: Store;
  person: Person;
  date: string;
  current: string;
  note?: string;
  onClose: () => void;
  onApply: (writes: CellWrite[]) => void;
}) {
  const { store, person, date, current, note, onClose, onApply } = props;
  const [code, setCode] = useState<string | null>(current || null); // '' = vaciar
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [replace, setReplace] = useState(true);

  const a = from || date;
  const b = to && to >= a ? to : a;
  const cell = (d: string) => store.grid(+d.slice(0, 4))[person.name]?.[d] ?? '';
  const all = code == null ? [] : rangeWrites(store.config, person, a, b, code);
  const outside = [...new Set(all.map((w) => w.date.slice(0, 4)).filter((y) => !store.years.includes(+y)))];
  const inside = all.filter((w) => store.years.includes(+w.date.slice(0, 4)));
  const occupied = inside.filter((w) => cell(w.date) && cell(w.date) !== w.code);
  const keep = code !== '' && !replace;
  const writes = inside.filter((w) => cell(w.date) !== w.code && !(keep && cell(w.date)));
  const period = a !== b;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Elegir código" onClick={(e) => e.stopPropagation()}>
        <h2>
          {person.name} · {formatShort(date)}
        </h2>
        {note && <p className="muted">{note}</p>}
        <div className="codes">
          {codesFor(store.config, person).map((c) => (
            <button
              key={c.code}
              className={c.code === code ? 'selected' : ''}
              aria-pressed={c.code === code}
              style={{ background: c.color }}
              onClick={() => setCode(c.code)}
            >
              <b>{c.code}</b>
              <small>{c.desc}</small>
            </button>
          ))}
          <button className={code === '' ? 'selected' : ''} aria-pressed={code === ''} onClick={() => setCode('')}>
            <b>Vaciar</b>
            <small>Quitar lo anotado</small>
          </button>
        </div>
        <div className="period">
          <label>
            Desde
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={to} min={a} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {period && code !== '' && (
          <label className="check">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Sustituir lo que ya esté anotado en esos días
          </label>
        )}
        <p className="muted summary">
          {code == null
            ? 'Elige un código.'
            : `${period ? 'Laborables del periodo (sin fines de semana ni festivos)' : 'Día'}: ${inside.length}. ` +
              (occupied.length
                ? `${occupied.length} ya ${occupied.length === 1 ? 'tiene' : 'tienen'} otro código y se ${keep ? 'respetará' : 'sustituirá'}${occupied.length === 1 ? '' : 'n'}. `
                : '') +
              `Se ${code === '' ? 'vaciarán' : 'anotarán'} ${writes.length}.`}
        </p>
        {outside.length > 0 && (
          <p className="warn inline">
            Parte del periodo cae en {outside.join(' y ')}, que todavía no tiene hoja en la app: esos días no se anotarán.
          </p>
        )}
        <div className="row">
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" disabled={code == null || writes.length === 0} onClick={() => onApply(writes)}>
            Aplicar{writes.length > 1 ? ` a ${writes.length} días` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
