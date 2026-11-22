import { useState } from 'react';
import { hasOfficialDays } from '../domain/defaults';
import { MONTHS, WEEKDAYS, todayIso } from '../domain/dates';
import { balances } from '../domain/logic';
import { teleworkToText, textToTelework } from '../domain/sheet';
import { type Code, type Person, ROLES, type Role, type SpecialDay } from '../domain/types';
import type { Store } from '../store';
import type { Run } from './App';
import { THEMES, getTheme, setTheme } from './theme';
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
  const [openCode, setOpenCode] = useState<number | null>(null);
  const [theme, setThemeState] = useState(getTheme);
  useUnsaved(dirty);

  const edit = <T,>(list: T[], set: (l: T[]) => void, i: number, patch: Partial<T>) => {
    set(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };
  const remove = <T,>(list: T[], set: (l: T[]) => void, i: number) => {
    set(list.filter((_, j) => j !== i));
    setDirty(true);
  };

  const yearDays = days.filter((d) => d.from && d.from.slice(0, 4) <= String(year) && (d.to || d.from).slice(0, 4) >= String(year));
  const coverLabel = (c: Code) =>
    c.role === 'niño' ? (c.weight > 0 ? 'necesita a alguien' : '') : c.weight === 1 ? 'cubre' : c.weight === 0.5 ? 'cubre ½' : '';

  /** Añade los festivos de Madrid del año que falten y los anota en el calendario de ese año. */
  const loadHolidays = () =>
    run(async () => {
      const missing = store.missingMadridDays(year);
      if (missing.length) await store.saveConfigOnly({ ...store.config, days: [...store.config.days, ...missing] });
      await store.applySpecialDays(year);
      setDays(store.config.days.map((d) => ({ ...d })));
    });

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
        <h2>Apariencia</h2>
        <div className="segmented" role="group" aria-label="Apariencia">
          {THEMES.map((t) => (
            <button
              key={t}
              className={t === theme ? 'active' : ''}
              aria-pressed={t === theme}
              onClick={() => { setTheme(t); setThemeState(t); }}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <p className="muted">«Sistema» sigue el modo claro u oscuro del dispositivo. Se guarda en este dispositivo.</p>
      </section>

      <section className="card">
        <h2>Personas</h2>
        <div className="plist">
          {people.map((p, i) => (
            <div key={i} className="prow">
              <input aria-label="Nombre" placeholder="Nombre" value={p.name} onChange={(e) => edit(people, setPeople, i, { name: e.target.value })} />
              {roleSelect(p.role, (role) => edit(people, setPeople, i, { role }), 'Rol')}
              <button className="icon" aria-label={`Quitar ${p.name}`} onClick={() => remove(people, setPeople, i)}>✕</button>
              {p.role === 'adulto' && (
                <label className="sub">
                  Vacaciones del año anterior hasta
                  <select aria-label={`Límite vacaciones año anterior ${p.name}`} value={p.carryMonth} onChange={(e) => edit(people, setPeople, i, { carryMonth: +e.target.value })}>
                    <option value={0}>Sin límite</option>
                    {MONTHS.map((m, k) => (
                      <option key={m} value={k + 1}>fin de {m.toLowerCase()}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => { setPeople([...people, { name: '', role: 'niño', telework: [], carryMonth: 0, orig: '', tw: '' }]); setDirty(true); }}>
          Añadir persona
        </button>
      </section>

      <section className="card">
        <h2>Teletrabajo</h2>
        <p className="muted">Días habituales de cada uno.</p>
        {people.map((p, i) =>
          p.role !== 'adulto' ? null : (
            <div key={i} className="twrow">
              <span className="twname">{p.name || 'Sin nombre'}</span>
              <span className="days5" role="group" aria-label={`Teletrabajo ${p.name}`}>
                {WEEKDAYS.slice(0, 5).map((d, k) => {
                  const on = textToTelework(p.tw).includes(k + 1);
                  return (
                    <button
                      key={d}
                      className={on ? 'on' : ''}
                      aria-pressed={on}
                      aria-label={`${d} ${p.name}`}
                      onClick={() => {
                        const set = new Set(textToTelework(p.tw));
                        if (on) set.delete(k + 1);
                        else set.add(k + 1);
                        edit(people, setPeople, i, { tw: teleworkToText([...set].sort()) });
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </span>
            </div>
          ),
        )}
        <button disabled={!hasYear || busy || dirty} onClick={() => run(() => store.applyTelework(year))}>
          Rellenar teletrabajo de {year}
        </button>
        <p className="muted">
          {dirty ? 'Guarda los ajustes antes de rellenar. ' : !hasYear ? `No hay hoja de ${year}. ` : ''}
          Solo rellena días laborables vacíos; no pisa nada de lo ya anotado.
        </p>
      </section>

      <Quotas store={store} year={year} run={run} />

      <section className="card">
        <h2>Códigos</h2>
        <p className="muted">Toca un código para editarlo.</p>
        {ROLES.map((role) => (
          <div key={role} className="cgroup">
            <h3>{role === 'adulto' ? 'Adultos' : role === 'niño' ? 'Niños' : 'Abuelos'}</h3>
            {codes.map((c, i) =>
              c.role !== role ? null : (
                <div key={i} className={`crow${openCode === i ? ' open' : ''}`}>
                  <button className="chead" aria-expanded={openCode === i} onClick={() => setOpenCode(openCode === i ? null : i)}>
                    <i style={{ background: c.color }}>{c.code || '?'}</i>
                    <span className="cdesc">{c.desc || 'Sin descripción'}</span>
                    <span className="cbadge">{coverLabel(c)}</span>
                  </button>
                  {openCode === i && (
                    <div className="cform">
                      <label>
                        Código
                        <input aria-label="Código" value={c.code} onChange={(e) => edit(codes, setCodes, i, { code: e.target.value.toUpperCase() })} />
                      </label>
                      <label>
                        Color
                        <input type="color" aria-label="Color" value={c.color} onChange={(e) => edit(codes, setCodes, i, { color: e.target.value })} />
                      </label>
                      <label className="wide">
                        Descripción
                        <input aria-label="Descripción" value={c.desc} onChange={(e) => edit(codes, setCodes, i, { desc: e.target.value })} />
                      </label>
                      <label>
                        Quién lo usa
                        {roleSelect(c.role, (r) => edit(codes, setCodes, i, { role: r }), 'Rol')}
                      </label>
                      <label>
                        {c.role === 'niño' ? 'Necesita a alguien' : 'Cubre a los niños'}
                        <select aria-label="Cobertura" value={c.weight} onChange={(e) => edit(codes, setCodes, i, { weight: +e.target.value })}>
                          {c.role === 'niño' ? (
                            <>
                              <option value={1}>Sí</option>
                              <option value={0}>No</option>
                            </>
                          ) : (
                            <>
                              <option value={1}>Día completo</option>
                              <option value={0.5}>Medio día</option>
                              <option value={0}>No</option>
                            </>
                          )}
                        </select>
                      </label>
                      <button className="danger wide" onClick={() => { setOpenCode(null); remove(codes, setCodes, i); }}>
                        Quitar código
                      </button>
                    </div>
                  )}
                </div>
              ),
            )}
            <button
              className="link"
              onClick={() => {
                setCodes([...codes, { code: '', desc: '', role, weight: role === 'niño' ? 1 : 1, color: '#dddddd' }]);
                setOpenCode(codes.length);
                setDirty(true);
              }}
            >
              + Añadir código
            </button>
          </div>
        ))}
        <p className="muted">T, F y VE los usa la app para teletrabajo, festivos y días sin cole.</p>
      </section>

      <section className="card">
        <h2>Festivos</h2>
        <p className="muted">
          {yearDays.length
            ? `${yearDays.filter((d) => d.type === 'festivo').length} festivos y ${yearDays.filter((d) => d.type === 'no lectivo').length} periodos sin cole en ${year}.`
            : `Ninguno cargado para ${year}.`}{' '}
          {hasOfficialDays(year)
            ? 'Lista oficial de Madrid capital.'
            : 'No hay lista oficial en la app para este año: se calculan los habituales de Madrid (incluida Semana Santa).'}
        </p>
        <button className="primary" disabled={!hasYear || busy || dirty} onClick={loadHolidays}>
          Cargar festivos de {year} en el calendario
        </button>
        <p className="muted">
          {dirty ? 'Guarda antes los ajustes. ' : !hasYear ? `Crea antes la hoja de ${year} en Calendario. ` : ''}
          Elige el año arriba con ‹ ›. Pone F a todos en los festivos y VE a los niños en los días sin cole, solo
          donde no haya nada anotado.
        </p>
        <details>
          <summary>Ver o editar la lista de {year}</summary>
          <table className="edit days">
            <thead>
              <tr><th>Desde</th><th>Hasta</th><th>Tipo</th><th>Descripción</th><th /></tr>
            </thead>
            <tbody>
              {days.map((d, i) =>
                d.from && !(d.from.slice(0, 4) <= String(year) && (d.to || d.from).slice(0, 4) >= String(year)) ? null : (
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
                ),
              )}
            </tbody>
          </table>
          <button onClick={() => { setDays([...days, { from: '', to: '', type: 'no lectivo', desc: '' }]); setDirty(true); }}>
            Añadir día
          </button>
        </details>
      </section>

      <button className="primary" disabled={!dirty || busy} onClick={save}>
        Guardar ajustes
      </button>

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

/** Días disponibles de cada tipo y persona en el año (se guarda al salir de cada casilla). */
function Quotas({ store, year, run }: { store: Store; year: number; run: Run }) {
  const { config } = store;
  const adults = config.people.filter((p) => p.role === 'adulto');
  const codes = config.codes.filter((c) => c.role === 'adulto' && c.code !== 'T' && c.code !== 'F');
  const prevGrid = store.years.includes(year - 1) ? store.grid(year - 1) : undefined;
  const today = todayIso();
  const info = new Map(
    adults.map((p) => [p.name, balances(config, store.grid(year), year, p, today, prevGrid)] as const),
  );
  const setQuota = (person: string, code: string, text: string) => {
    const quotas = config.quotas.filter((q) => !(q.year === year && q.person === person && q.code === code));
    const n = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(n)) quotas.push({ year, person, code, available: n });
    run(() => store.saveConfigOnly({ ...config, quotas }));
  };
  if (!adults.length) return null;
  return (
    <section className="card">
      <h2>Días disponibles en {year}</h2>
      <p className="muted">
        Total de días de cada tipo para el año; vacío si no tiene límite. Se guarda al salir de la casilla. Las
        vacaciones del año anterior (VP) se calculan solas con lo que sobró, salvo que pongas otra cifra.
      </p>
      <table className="edit quotas">
        <thead>
          <tr>
            <th>Tipo</th>
            {adults.map((p) => (
              <th key={p.name}>{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => (
            <tr key={c.code}>
              <td><i style={{ background: c.color }}>{c.code}</i> {c.desc}</td>
              {adults.map((p) => {
                const b = info.get(p.name)?.find((x) => x.code.code === c.code);
                const value = b && !b.auto ? b.available ?? '' : '';
                return (
                  <td key={p.name}>
                    <input
                      key={`${year}-${b?.available}-${b?.auto}`}
                      className="short"
                      inputMode="decimal"
                      aria-label={`Disponibles ${c.desc} ${p.name}`}
                      defaultValue={value}
                      placeholder={b?.auto ? String(b.available) : '–'}
                      title={b?.auto ? 'Calculado: lo que quedó sin gastar el año anterior' : undefined}
                      onBlur={(e) => e.target.value !== String(value) && setQuota(p.name, c.code, e.target.value)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
