import { useState } from 'react';
import { MONTHS } from '../domain/dates';
import { teleworkToText, textToTelework } from '../domain/sheet';
import { type Code, type Person, ROLES, type Role, type SpecialDay } from '../domain/types';
import type { Store } from '../store';
import type { Run } from './App';
import { useUnsaved } from './dirty';

interface Props {
  store: Store;
  year: number;
  hasYear: boolean;
  busy: boolean;
  run: Run;
  onDisconnect: () => void;
}

type PersonRow = Person & { orig: string; tw: string };

export function SettingsView({ store, year, hasYear, busy, run, onDisconnect }: Props) {
  const [people, setPeople] = useState<PersonRow[]>(() =>
    store.config.people.map((p) => ({ ...p, orig: p.name, tw: teleworkToText(p.telework) })),
  );
  const [codes, setCodes] = useState<Code[]>(() => store.config.codes.map((c) => ({ ...c })));
  const [days, setDays] = useState<SpecialDay[]>(() => store.config.days.map((d) => ({ ...d })));
  const [dirty, setDirty] = useState(false);
  useUnsaved(dirty);

  const edit = <T,>(list: T[], set: (l: T[]) => void, i: number, patch: Partial<T>) => {
    set(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };
  const remove = <T,>(list: T[], set: (l: T[]) => void, i: number) => {
    set(list.filter((_, j) => j !== i));
    setDirty(true);
  };

  const save = () => {
    const removed = store.config.people.filter((p) => !people.some((r) => r.orig === p.name));
    if (
      removed.length &&
      !confirm(`Se borrarán de las hojas las filas de: ${removed.map((p) => p.name).join(', ')}. ¿Continuar?`)
    )
      return;
    const renames = new Map(people.filter((p) => p.orig && p.orig !== p.name.trim()).map((p) => [p.orig, p.name.trim()]));
    run(async () => {
      await store.saveConfig(
        {
          ...store.config,
          people: people.map((p) => ({
            name: p.name.trim(), role: p.role, telework: textToTelework(p.tw), carryMonth: p.role === 'adulto' ? p.carryMonth : 0,
          })),
          codes: codes.filter((c) => c.code.trim()).map((c) => ({ ...c, code: c.code.trim() })),
          days: days.filter((d) => d.from).map((d) => ({ ...d, to: d.to && d.to >= d.from ? d.to : d.from })),
        },
        renames,
      );
      setPeople(store.config.people.map((p) => ({ ...p, orig: p.name, tw: teleworkToText(p.telework) })));
      setDirty(false);
    });
  };

  const roleSelect = (value: Role, onChange: (r: Role) => void, label: string) => (
    <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as Role)}>
      {ROLES.map((r) => (
        <option key={r}>{r}</option>
      ))}
    </select>
  );

  return (
    <div className="cards">
      <section className="card">
        <h2>Personas</h2>
        <p className="muted">Teletrabajo: días habituales con letras L, M, X, J, V separadas por comas. Las vacaciones que sobran de un año
          pasan solas al siguiente como VP y se pueden gastar hasta el mes indicado.</p>
        <table className="edit">
          <thead>
            <tr><th>Nombre</th><th>Rol</th><th>Teletrabajo</th><th>Vac. año anterior hasta</th><th /></tr>
          </thead>
          <tbody>
            {people.map((p, i) => (
              <tr key={i}>
                <td><input aria-label="Nombre" value={p.name} onChange={(e) => edit(people, setPeople, i, { name: e.target.value })} /></td>
                <td>{roleSelect(p.role, (role) => edit(people, setPeople, i, { role }), 'Rol')}</td>
                <td>
                  {p.role === 'adulto' && (
                    <input aria-label="Teletrabajo" value={p.tw} placeholder="M,V" onChange={(e) => edit(people, setPeople, i, { tw: e.target.value })} />
                  )}
                </td>
                <td>
                  {p.role === 'adulto' && (
                    <select aria-label={`Límite vacaciones año anterior ${p.name}`} value={p.carryMonth} onChange={(e) => edit(people, setPeople, i, { carryMonth: +e.target.value })}>
                      <option value={0}>Sin límite</option>
                      {MONTHS.map((m, k) => (
                        <option key={m} value={k + 1}>Fin de {m.toLowerCase()}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td><button aria-label={`Quitar ${p.name}`} onClick={() => remove(people, setPeople, i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => { setPeople([...people, { name: '', role: 'niño', telework: [], carryMonth: 0, orig: '', tw: '' }]); setDirty(true); }}>
          Añadir persona
        </button>
      </section>

      <section className="card">
        <h2>Códigos</h2>
        <p className="muted">
          Cobertura: en adultos y abuelos, cuánto cubre (1, 0.5 o 0); en niños, si necesita a alguien (1) o no (0).
          Los códigos T, F y VE los usa la app para teletrabajo, festivos y no lectivos.
        </p>
        <table className="edit">
          <thead>
            <tr><th>Cód.</th><th>Descripción</th><th>Rol</th><th>Cob.</th><th>Color</th><th /></tr>
          </thead>
          <tbody>
            {codes.map((c, i) => (
              <tr key={i}>
                <td><input className="short" aria-label="Código" value={c.code} onChange={(e) => edit(codes, setCodes, i, { code: e.target.value.toUpperCase() })} /></td>
                <td><input aria-label="Descripción" value={c.desc} onChange={(e) => edit(codes, setCodes, i, { desc: e.target.value })} /></td>
                <td>{roleSelect(c.role, (role) => edit(codes, setCodes, i, { role }), 'Rol')}</td>
                <td>
                  <select aria-label="Cobertura" value={c.weight} onChange={(e) => edit(codes, setCodes, i, { weight: +e.target.value })}>
                    <option value={1}>1</option>
                    <option value={0.5}>0.5</option>
                    <option value={0}>0</option>
                  </select>
                </td>
                <td><input type="color" aria-label="Color" value={c.color} onChange={(e) => edit(codes, setCodes, i, { color: e.target.value })} /></td>
                <td><button aria-label={`Quitar ${c.code}`} onClick={() => remove(codes, setCodes, i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => { setCodes([...codes, { code: '', desc: '', role: 'adulto', weight: 1, color: '#dddddd' }]); setDirty(true); }}>
          Añadir código
        </button>
      </section>

      <section className="card">
        <h2>Festivos y días no lectivos</h2>
        <p className="muted">Precargado con Madrid capital 2027. Revisa los marcados como «sin confirmar».</p>
        <table className="edit">
          <thead>
            <tr><th>Desde</th><th>Hasta</th><th>Tipo</th><th>Descripción</th><th /></tr>
          </thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={i}>
                <td><input type="date" aria-label="Desde" value={d.from} onChange={(e) => edit(days, setDays, i, { from: e.target.value })} /></td>
                <td><input type="date" aria-label="Hasta" value={d.to} onChange={(e) => edit(days, setDays, i, { to: e.target.value })} /></td>
                <td>
                  <select aria-label="Tipo" value={d.type} onChange={(e) => edit(days, setDays, i, { type: e.target.value as SpecialDay['type'] })}>
                    <option>festivo</option>
                    <option>no lectivo</option>
                  </select>
                </td>
                <td><input aria-label="Descripción" value={d.desc} onChange={(e) => edit(days, setDays, i, { desc: e.target.value })} /></td>
                <td><button aria-label="Quitar día" onClick={() => remove(days, setDays, i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => { setDays([...days, { from: '', to: '', type: 'no lectivo', desc: '' }]); setDirty(true); }}>
          Añadir día
        </button>
      </section>

      <button className="primary" disabled={!dirty || busy} onClick={save}>
        Guardar ajustes
      </button>

      <section className="card">
        <h2>Acciones sobre {year}</h2>
        <p className="muted">Solo rellenan celdas vacías; no pisan nada de lo ya anotado. Guarda antes los ajustes.</p>
        <button disabled={!hasYear || busy || dirty} onClick={() => run(() => store.applyTelework(year))}>
          Rellenar teletrabajo según el patrón
        </button>
        <button disabled={!hasYear || busy || dirty} onClick={() => run(() => store.applySpecialDays(year))}>
          Rellenar festivos y no lectivos
        </button>
      </section>

      <section className="card">
        <h2>Conexión</h2>
        {store.legacy.length > 0 && (
          <p className="muted">Hojas con formato antiguo: {store.legacy.join(', ')}. Para editarlas desde la app, ve a ese año en Calendario e impórtalo.</p>
        )}
        <button onClick={onDisconnect}>Desconectar / cambiar de hoja</button>
      </section>
    </div>
  );
}
