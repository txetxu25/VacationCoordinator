import { useState } from 'react';
import { WEEKDAYS, daysInMonth, formatShort, isWeekend, iso, weekday } from '../domain/dates';
import { codesFor, coverage, findCode, specialDays, uncoveredDays } from '../domain/logic';
import type { Person } from '../domain/types';
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
                  const def = code ? findCode(config, p, code) : undefined;
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
          onChoose={(code, until) => {
            setPick(null);
            run(() => store.setRange(pick.person, pick.date, until, code));
          }}
        />
      )}
    </>
  );
}

function Picker(props: {
  store: Store;
  person: Person;
  date: string;
  current: string;
  note?: string;
  onClose: () => void;
  onChoose: (code: string, until: string) => void;
}) {
  const { store, person, date, current, note, onClose, onChoose } = props;
  const [until, setUntil] = useState(date);
  const end = until && until >= date ? until : date;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Elegir código" onClick={(e) => e.stopPropagation()}>
        <h2>
          {person.name} · {formatShort(date)}
        </h2>
        {note && <p className="muted">{note}</p>}
        <label className="until">
          Aplicar hasta (salta fines de semana y festivos)
          <input type="date" value={until} min={date} max={`${date.slice(0, 4)}-12-31`} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <div className="codes">
          {codesFor(store.config, person).map((c) => (
            <button
              key={c.code}
              className={c.code === current ? 'selected' : ''}
              style={{ background: c.color }}
              onClick={() => onChoose(c.code, end)}
            >
              <b>{c.code}</b>
              <small>{c.desc}</small>
            </button>
          ))}
        </div>
        <div className="row">
          <button onClick={() => onChoose('', end)}>Vaciar</button>
          <button onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
