import { useState } from 'react';
import { hasOfficialDays } from '../domain/defaults';
import { MONTHS, todayIso } from '../domain/dates';
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
        <button disabled={!hasYear || busy || dirty} onClick={() => run(() => store.applyTelework(year))}>
          Rellenar teletrabajo de {year} según el patrón
        </button>
        <p className="muted">
          {dirty ? 'Guarda los ajustes antes de rellenar. ' : !hasYear ? `No hay hoja de ${year}. ` : ''}
          Solo rellena días laborables vacíos; no pisa nada de lo ya anotado.
        </p>
      </section>

      <Quotas store={store} year={year} run={run} />

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
        <h2>Festivos y días no lectivos de {year}</h2>
        <p className="muted">
          Al guardar, los festivos se anotan como F para todas las personas en los días que tengan vacíos. Revisa los
          marcados como «sin confirmar».
        </p>
        <table className="edit days">
          <thead>
            <tr><th>Desde</th><th>Hasta</th><th>Tipo</th><th>Descripción</th><th /></tr>
          </thead>
          <tbody>
            {days.map((d, i) => (
              // Solo los del año elegido arriba (y los nuevos, aún sin fecha); el resto se conserva
              d.from && !(d.from.slice(0, 4) <= String(year) && (d.to || d.from).slice(0, 4) >= String(year)) ? null :
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
        <button
          disabled={store.missingMadridDays(year, days).length === 0}
          onClick={() => { setDays([...days, ...store.missingMadridDays(year, days)]); setDirty(true); }}
        >
          {store.missingMadridDays(year, days).length ? `Cargar festivos de Madrid de ${year}` : `Festivos de ${year} ya cargados`}
        </button>
        <button disabled={!hasYear || busy || dirty} onClick={() => run(() => store.applySpecialDays(year))}>
          Anotar en el calendario de {year}
        </button>
        <p className="muted">
          El año es el que elijas arriba con ‹ ›.{' '}
          {hasOfficialDays(year)
            ? `Para ${year} se cargan los festivos oficiales.`
            : `Para ${year} no hay lista oficial en la app: se calculan los habituales (incluida Semana Santa) y van marcados para revisar traslados y cambios del año.`}{' '}
          Los no lectivos del colegio hay que añadirlos a mano. «Anotar» pone F a todos y VE a los niños en los días
          vacíos{dirty ? '; guarda antes los ajustes' : ''}.
        </p>
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
