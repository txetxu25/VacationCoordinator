import { useState } from 'react';
import { addDays, formatLong, weekday } from '../domain/dates';
import { analyzeLeave, blockEnd, timeline } from '../domain/leave';
import type { BirthRules, LeaveBlock } from '../domain/types';
import type { Store } from '../store';
import type { Run } from './App';
import { useUnsaved } from './dirty';

const RULE_FIELDS: [keyof BirthRules, string][] = [
  ['total', 'Semanas por progenitor'],
  ['mandatory', 'Obligatorias tras el nacimiento'],
  ['months', 'Meses para disfrutar el resto'],
  ['extra', 'Semanas que pueden ir más tarde'],
];

/** Planificador del permiso por nacimiento, en semanas naturales completas. */
export function Leave({ store, run, busy }: { store: Store; run: Run; busy: boolean }) {
  const [rules, setRules] = useState<BirthRules>({ ...store.config.rules });
  const [blocks, setBlocks] = useState<LeaveBlock[]>(() => store.config.leaves.map((b) => ({ ...b })));
  const [dirty, setDirty] = useState(false);
  useUnsaved(dirty);
  const adults = store.config.people.filter((p) => p.role === 'adulto').map((p) => p.name);

  const change = (next: LeaveBlock[]) => {
    setBlocks(next);
    setDirty(true);
  };
  const edit = (i: number, patch: Partial<LeaveBlock>) => change(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const add = (person: string) => {
    const mine = blocks.filter((b) => b.person === person && b.start);
    let start = rules.birth;
    let weeks = rules.mandatory;
    if (mine.length) {
      // siguiente lunes libre tras el último bloque
      start = addDays(mine.map(blockEnd).sort().pop()!, 1);
      while (weekday(start) !== 1) start = addDays(start, 1);
      weeks = 1;
    }
    change([...blocks, { person, start, weeks, note: '' }]);
  };

  const weeks = timeline(rules, blocks, adults);
  const firstYear = weeks.slice(0, Math.round((rules.months * 52) / 12));
  const both = firstYear.filter((w) => w.on.every(Boolean) && w.on.length > 1).length;
  const nobody = firstYear.filter((w) => !w.on.some(Boolean)).length;

  return (
    <div className="cards">
      <section className="card">
        <h2>Nacimiento</h2>
        <label className="field">
          Fecha de nacimiento (prevista)
          <input
            type="date"
            value={rules.birth}
            onChange={(e) => { setRules({ ...rules, birth: e.target.value }); setDirty(true); }}
          />
        </label>
        <details>
          <summary>Reglas del permiso</summary>
          <p className="muted">
            Valores por defecto del régimen general (19 semanas: 6 obligatorias, 11 en los primeros 12 meses y 2 hasta
            los 8 años). Compruébalos con vuestra empresa o la Seguridad Social y ajústalos si vuestro caso es distinto.
          </p>
          <div className="rules">
            {RULE_FIELDS.map(([k, label]) => (
              <label key={k} className="field">
                {label}
                <input
                  type="number"
                  min={0}
                  value={rules[k]}
                  onChange={(e) => { setRules({ ...rules, [k]: Math.max(0, +e.target.value || 0) }); setDirty(true); }}
                />
              </label>
            ))}
          </div>
        </details>
      </section>

      {adults.map((person) => {
        const a = analyzeLeave(rules, blocks, person);
        return (
          <section key={person} className="card">
            <h2>{person}</h2>
            <p className={a.remaining < 0 ? 'neg' : ''}>
              <strong>{a.used}</strong> de {rules.total} semanas planificadas · quedan <strong>{a.remaining}</strong>
            </p>
            {blocks.some((b) => b.person === person) && (
              <table className="edit">
                <thead>
                  <tr><th>Empieza</th><th>Semanas</th><th>Termina</th><th /></tr>
                </thead>
                <tbody>
                  {blocks.map((b, i) =>
                    b.person !== person ? null : (
                      <tr key={i}>
                        <td><input type="date" aria-label={`Inicio ${person}`} value={b.start} onChange={(e) => edit(i, { start: e.target.value })} /></td>
                        <td>
                          <input
                            className="short"
                            type="number"
                            min={1}
                            aria-label={`Semanas ${person}`}
                            value={b.weeks}
                            onChange={(e) => edit(i, { weeks: Math.max(1, Math.round(+e.target.value) || 1) })}
                          />
                        </td>
                        <td className="end">{b.start ? formatLong(blockEnd(b)) : ''}</td>
                        <td><button aria-label="Quitar bloque" onClick={() => change(blocks.filter((_, j) => j !== i))}>✕</button></td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            )}
            {a.warnings.map((w) => (
              <p key={w} className="warn inline">{w}</p>
            ))}
            <button disabled={!rules.birth} onClick={() => add(person)}>Añadir bloque de semanas</button>
          </section>
        );
      })}

      {weeks.length > 0 && (
        <section className="card">
          <h2>Semanas desde el nacimiento</h2>
          <div className="tl" style={{ gridTemplateColumns: `4.5em repeat(${weeks.length}, 1fr)` }}>
            {adults.map((person, pi) => (
              <TimelineRow key={person} label={person}>
                {weeks.map((w, i) => (
                  <span key={i} className={`${w.on[pi] ? 'on' : ''}${i % 4 === 0 ? ' tick' : ''}`} title={formatLong(w.start)} />
                ))}
              </TimelineRow>
            ))}
            <TimelineRow label="En casa">
              {weeks.map((w, i) => {
                const n = w.on.filter(Boolean).length;
                return <span key={i} className={`${n === 0 ? 'none' : n > 1 ? 'both' : 'one'}${i % 4 === 0 ? ' tick' : ''}`} />;
              })}
            </TimelineRow>
          </div>
          <p className="muted">
            Cada cuadro es una semana; las marcas van de 4 en 4. «En casa»: verde oscuro si coincidís los dos, verde
            claro si hay uno y rojo si no hay nadie de permiso. En los primeros {rules.months} meses: {both} semanas
            coincidís los dos y {nobody} no hay nadie de permiso.
          </p>
        </section>
      )}

      <p className="muted">
        Al guardar, cada semana se anota como PN de lunes a viernes en el calendario (fines de semana y festivos
        también cuentan como permiso, aunque no se pinten).
      </p>
      <button
        className="primary"
        disabled={!dirty || busy}
        onClick={() =>
          run(async () => {
            await store.saveLeaves(blocks.filter((b) => b.start && b.weeks > 0), rules);
            setDirty(false);
          })
        }
      >
        Guardar plan
      </button>
    </div>
  );
}

function TimelineRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <b>{label}</b>
      {children}
    </>
  );
}
