import { useState } from 'react';
import { STANDARD_BIRTH_LEAVE } from '../domain/defaults';
import { addDays, formatLong, weekday } from '../domain/dates';
import { type Plan, analyzeLeave, blockEnd, fmt, hasOverlap, timeline } from '../domain/leave';
import { holidayChecker } from '../domain/logic';
import { LEAVE_UNITS, type LeaveBlock, type LeaveType, type LeaveUnit } from '../domain/types';
import type { Store } from '../store';
import type { Run } from './App';
import { useUnsaved } from './dirty';

/** En pantalla, cada permiso lleva sus bloques dentro (así renombrarlo no rompe nada). */
type Draft = LeaveType & { blocks: LeaveBlock[] };

const toDrafts = (store: Store): Draft[] =>
  store.config.leaveTypes.map((t) => ({
    ...t,
    blocks: store.config.leaves.filter((b) => b.person === t.person && b.type === t.name).map((b) => ({ ...b })),
  }));

/** Planificador de permisos: cada persona define los suyos (duración, unidad, código) y los reparte en bloques. */
export function Leave({ store, run, busy }: { store: Store; run: Run; busy: boolean }) {
  const [birth, setBirth] = useState(store.config.birth);
  const [drafts, setDrafts] = useState<Draft[]>(() => toDrafts(store));
  const [dirty, setDirty] = useState(false);
  useUnsaved(dirty);
  const adults = store.config.people.filter((p) => p.role === 'adulto').map((p) => p.name);
  const codes = store.config.codes.filter((c) => c.role === 'adulto');
  const isHoliday = holidayChecker(store.config);

  const change = (next: Draft[]) => {
    setDrafts(next);
    setDirty(true);
  };
  const editType = (i: number, patch: Partial<Draft>) => change(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const editBlock = (i: number, k: number, patch: Partial<LeaveBlock>) =>
    editType(i, { blocks: drafts[i].blocks.map((b, j) => (j === k ? { ...b, ...patch } : b)) });

  // El plan tal como está en pantalla, para analizarlo antes de guardar
  const plan: Plan = {
    types: drafts.map(({ blocks: _blocks, ...t }) => t),
    blocks: drafts.flatMap((d) => d.blocks.map((b) => ({ ...b, person: d.person, type: d.name }))),
  };

  const addType = (person: string) => {
    const first = !drafts.some((d) => d.person === person);
    const byDesc = (re: RegExp, half: boolean) => codes.find((c) => re.test(c.desc) && (c.weight === 0.5) === half)?.code;
    change([
      ...drafts,
      first
        ? {
            person, name: 'Nacimiento y cuidado del menor', ...STANDARD_BIRTH_LEAVE,
            code: byDesc(/nacimiento/i, false) ?? codes[0]?.code ?? '',
            halfCode: byDesc(/nacimiento/i, true) ?? '',
            blocks: [],
          }
        : {
            person, name: 'Nuevo permiso', code: codes[0]?.code ?? '', halfCode: '', unit: 'días laborables',
            amount: 5, mandatory: 0, months: 0, extra: 0, blocks: [],
          },
    ]);
  };

  const addBlock = (i: number) => {
    const d = drafts[i];
    const ends = plan.blocks
      .filter((b) => b.person === d.person && b.start)
      .map((b) => blockEnd(b, plan.types.find((t) => t.person === b.person && t.name === b.type)!, isHoliday));
    let start = birth || '';
    let amount = d.mandatory || 1;
    if (ends.length) {
      // siguiente lunes libre tras el último bloque de esa persona
      start = addDays(ends.sort().pop()!, 1);
      while (weekday(start) !== 1) start = addDays(start, 1);
      amount = 1;
    }
    editType(i, { blocks: [...d.blocks, { person: d.person, type: d.name, start, amount, half: false, note: '' }] });
  };

  const weeks = timeline(birth, plan, adults, isHoliday);
  const firstYear = weeks.slice(0, 52);
  const both = firstYear.filter((w) => w.on.length > 1 && w.on.every(Boolean)).length;
  const nobody = firstYear.filter((w) => !w.on.some(Boolean)).length;
  const names = drafts.map((d) => `${d.person}|${d.name.trim()}`);
  const invalid = names.some((n, i) => !drafts[i].name.trim() || names.indexOf(n) !== i);

  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0);

  return (
    <div className="cards">
      <section className="card">
        <h2>Nacimiento</h2>
        <label className="field">
          Fecha de nacimiento (prevista)
          <input type="date" value={birth} onChange={(e) => { setBirth(e.target.value); setDirty(true); }} />
        </label>
        <p className="muted">
          Cada persona tiene sus propios permisos, con la duración que le dé su empresa. Un permiso en semanas se
          reparte en bloques de 7 días seguidos desde el día de inicio (por ejemplo, de jueves a miércoles).
        </p>
      </section>

      {adults.map((person) => (
        <section key={person} className="card">
          <h2>{person}</h2>
          {hasOverlap(plan, person, isHoliday) && <p className="warn inline">Hay bloques que se pisan entre sí.</p>}
          {drafts.map((d, i) => {
            if (d.person !== person) return null;
            const a = analyzeLeave(birth, plan.types[i], plan.blocks, isHoliday);
            return (
              <div key={i} className="ltype">
                <div className="lhead">
                  <input aria-label={`Nombre del permiso de ${person}`} value={d.name} onChange={(e) => editType(i, { name: e.target.value })} />
                  <button aria-label={`Quitar permiso ${d.name}`} onClick={() => change(drafts.filter((_, j) => j !== i))}>✕</button>
                </div>
                <p className={a.remaining < 0 ? 'neg' : ''}>
                  Planificado: <strong>{fmt(a.used)}</strong> de {fmt(d.amount)} {d.unit} · sin planificar: <strong>{fmt(a.remaining)}</strong>
                </p>
                <details>
                  <summary>Duración, código y reglas</summary>
                  <div className="rules">
                    <label className="field">
                      Duración
                      <input inputMode="decimal" aria-label={`Duración ${d.name}`} value={d.amount} onChange={(e) => editType(i, { amount: num(e.target.value) })} />
                    </label>
                    <label className="field">
                      Unidad
                      <select aria-label={`Unidad ${d.name}`} value={d.unit} onChange={(e) => editType(i, { unit: e.target.value as LeaveUnit })}>
                        {LEAVE_UNITS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Código en el calendario
                      <select aria-label={`Código ${d.name}`} value={d.code} onChange={(e) => editType(i, { code: e.target.value })}>
                        {!codes.some((c) => c.code === d.code) && <option value={d.code}>{d.code || '—'}</option>}
                        {codes.map((c) => (
                          <option key={c.code} value={c.code}>{c.code} · {c.desc}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Código a media jornada
                      <select aria-label={`Código media jornada ${d.name}`} value={d.halfCode} onChange={(e) => editType(i, { halfCode: e.target.value })}>
                        <option value="">No admite media jornada</option>
                        {codes.map((c) => (
                          <option key={c.code} value={c.code}>{c.code} · {c.desc}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Obligatorias desde el nacimiento
                      <input inputMode="decimal" value={d.mandatory} onChange={(e) => editType(i, { mandatory: num(e.target.value) })} />
                    </label>
                    <label className="field">
                      Meses para disfrutarlo (0 = sin límite)
                      <input inputMode="decimal" value={d.months} onChange={(e) => editType(i, { months: num(e.target.value) })} />
                    </label>
                    <label className="field">
                      Pueden ir después de esos meses
                      <input inputMode="decimal" value={d.extra} onChange={(e) => editType(i, { extra: num(e.target.value) })} />
                    </label>
                  </div>
                  <p className="muted">
                    Los códigos se crean en Ajustes → Códigos. Si el permiso no depende del nacimiento, deja las
                    obligatorias y los meses a 0.
                  </p>
                </details>
                {d.blocks.length > 0 && (
                  <table className="edit">
                    <thead>
                      <tr><th>Empieza</th><th>{d.unit === 'semanas' ? 'Semanas' : 'Días'}</th>{d.halfCode && <th>½</th>}<th>Termina</th><th /></tr>
                    </thead>
                    <tbody>
                      {d.blocks.map((b, k) => (
                        <tr key={k}>
                          <td><input type="date" aria-label={`Inicio ${d.name} ${person}`} value={b.start} onChange={(e) => editBlock(i, k, { start: e.target.value })} /></td>
                          <td>
                            <input
                              className="short"
                              type="number"
                              min={1}
                              aria-label={`Cantidad ${d.name} ${person}`}
                              value={b.amount}
                              onChange={(e) => editBlock(i, k, { amount: Math.max(1, Math.round(+e.target.value) || 1) })}
                            />
                          </td>
                          {d.halfCode && (
                            <td>
                              <input type="checkbox" aria-label="Media jornada" title="Media jornada" checked={b.half} onChange={(e) => editBlock(i, k, { half: e.target.checked })} />
                            </td>
                          )}
                          <td className="end">{b.start ? formatLong(blockEnd({ ...b, person, type: d.name }, plan.types[i], isHoliday)) : ''}</td>
                          <td><button aria-label="Quitar bloque" onClick={() => editType(i, { blocks: d.blocks.filter((_, j) => j !== k) })}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {a.warnings.map((w) => (
                  <p key={w} className="warn inline">{w}</p>
                ))}
                <button onClick={() => addBlock(i)}>Añadir bloque</button>
              </div>
            );
          })}
          <button onClick={() => addType(person)}>Añadir permiso</button>
        </section>
      ))}

      {weeks.length > 0 && plan.blocks.length > 0 && (
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
            claro si hay uno y rojo si no hay nadie de permiso. En el primer año: {both} semanas coincidís y {nobody} no
            hay nadie.
          </p>
        </section>
      )}

      <p className="muted">
        Al guardar, cada bloque se anota con su código en los días laborables del calendario; los fines de semana
        cuentan como permiso aunque no se pinten. Un bloque a media jornada dura lo mismo pero consume la mitad.
      </p>
      {invalid && <p className="warn inline">Cada permiso de una persona necesita un nombre distinto.</p>}
      <button
        className="primary"
        disabled={!dirty || busy || invalid}
        onClick={() =>
          run(async () => {
            const types = plan.types.map((t) => ({ ...t, name: t.name.trim() }));
            const blocks = plan.blocks.filter((b) => b.start && b.amount > 0).map((b) => ({ ...b, type: b.type.trim() }));
            await store.saveLeaves(types, blocks, birth);
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
