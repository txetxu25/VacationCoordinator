import { MONTHS, formatLong, formatShort } from '../domain/dates';
import { fmt, leaveProgress } from '../domain/leave';
import { balances, holidayChecker } from '../domain/logic';
import { type CodeCount, codeCounts, coverers, isAbsence, isSick, monthly, nextAbsence } from '../domain/stats';
import type { Person } from '../domain/types';
import type { Store } from '../store';
import { Avatar, personColor } from './look';

/**
 * Pestaña de solo lectura. Primero los adultos (lo que más se consulta), luego quién ha cubierto
 * los días con niños en casa, y al final niños y abuelos.
 */
export function Balances({ store, year, today }: { store: Store; year: number; today: string }) {
  const { config } = store;
  const grid = store.grid(year);
  const gridOf = (y: number) => store.grid(y);
  const isHoliday = holidayChecker(config);
  const prevGrid = store.years.includes(year - 1) ? store.grid(year - 1) : undefined;
  const adults = config.people.filter((p) => p.role === 'adulto');
  const others = config.people.filter((p) => p.role !== 'adulto').sort((a, b) => (a.role === 'niño' ? -1 : 0) - (b.role === 'niño' ? -1 : 0));
  const months = adults.map((p) => monthly(config, grid, year, p, today));
  const maxMonth = Math.max(1, ...months.flat().map((m) => m.spent + m.planned));
  const days = (n: number) => `${fmt(n)} ${n === 1 ? 'día' : 'días'}`;
  const weeksLeft = year === +today.slice(0, 4) ? Math.max(0, Math.round((Date.parse(`${year}-12-31`) - Date.parse(today)) / 604800000)) : null;

  const card = (p: Person, mi = -1) => {
    const all = codeCounts(config, grid, year, p, today);
    const counts = all.filter((c) => isAbsence(c.code, p.role));
    const remote = all.find((c) => !isAbsence(c.code, p.role));
    const total = counts.reduce((n, c) => n + c.spent + c.planned, 0);
    const sickDays = counts.filter((c) => isSick(c.code)).reduce((n, c) => n + (c.spent + c.planned) * (c.code.weight === 0.5 ? 0.5 : 1), 0);
    const adult = p.role === 'adulto';
    const quotas = adult ? balances(config, grid, year, p, today, prevGrid).filter((b) => b.available != null) : [];
    const carry = quotas.find((b) => b.expiry);
    const next = adult ? nextAbsence(config, gridOf, p, today) : undefined;
    const noun = p.role === 'abuelos' ? 'cubriendo' : p.role === 'niño' ? 'en casa' : 'de ausencia';
    return (
      <section key={p.name} className="card">
        <h2 className="who">
          <Avatar people={config.people} name={p.name} size={34} />
          <span>
            {p.name}
            <small>
              {total ? `${days(total)} ${noun} en ${year}` : `Nada anotado en ${year}`}
              {remote ? ` · ${days(remote.spent + remote.planned)} de teletrabajo` : ''}
            </small>
          </span>
        </h2>

        {(next || sickDays > 0) && (
          <div className="pills">
            {next && (
              <span className="pill next">
                Próxima: <i style={{ background: next.code.color }}>{next.code.code}</i>{' '}
                {next.from === next.to ? formatShort(next.from) : `${formatShort(next.from)} – ${formatShort(next.to)}`}
                {' · '}
                {next.inDays === 1 ? 'mañana' : `en ${next.inDays} días`}
              </span>
            )}
            {sickDays > 0 && (
              <span className="pill sick">
                {p.role === 'niño' ? 'Malo' : 'De baja'}: <b>{days(sickDays)}</b>
              </span>
            )}
          </div>
        )}

        {config.leaveTypes
          .filter((t) => t.person === p.name)
          .map((t) => {
            const pr = leaveProgress(t, config.leaves, today, isHoliday);
            const u = t.unit === 'semanas' ? 'semanas' : 'días';
            return (
              <div key={t.name} className="leave">
                <h3>{t.name}</h3>
                <div className="tiles">
                  <span><b>{fmt(pr.done)}</b>disfrutadas</span>
                  <span><b>{fmt(pr.planned)}</b>planificadas</span>
                  <span className={pr.free < 0 ? 'neg' : ''}><b>{fmt(pr.free)}</b>por planificar</span>
                </div>
                <span className="htrack tall">
                  <Seg n={pr.done} of={Math.max(t.amount, pr.done + pr.planned)} color={personColor(config.people, p.name)} />
                  <Seg n={pr.planned} of={Math.max(t.amount, pr.done + pr.planned)} color={personColor(config.people, p.name)} planned />
                </span>
                <span className="msub">
                  {u[0].toUpperCase() + u.slice(1)}, de {fmt(t.amount)} en total.
                  {pr.next && ` ${pr.next.start <= today ? 'En curso' : 'Próximo bloque'}: ${formatLong(pr.next.start)} – ${formatLong(pr.next.end)}.`}
                </span>
              </div>
            );
          })}

        {quotas.length > 0 && <h3>Días disponibles en {year}</h3>}
        {quotas.map((b) => {
          const top = Math.max(b.available ?? 0, b.spent + b.planned, 1);
          return (
            <div key={b.code.code} className="meter">
              <div className="mtop">
                <span className="mname"><i style={{ background: b.code.color }}>{b.code.code}</i> {b.code.desc}</span>
                <span className={`mleft${(b.remaining ?? 0) < 0 ? ' neg' : ''}`}>
                  <b>{fmt(b.remaining ?? 0)}</b> sin usar de {fmt(b.available ?? 0)}
                </span>
              </div>
              <span className="htrack tall">
                <Seg n={b.spent} of={top} color={b.code.color} />
                <Seg n={b.planned} of={top} color={b.code.color} planned />
              </span>
              <span className="msub">
                {fmt(b.spent)} {b.spent === 1 ? 'gastado' : 'gastados'}
                {b.planned > 0 && <> · {fmt(b.planned)} {b.planned === 1 ? 'planificado' : 'planificados'}</>}
                {b.code.code === 'V' && weeksLeft != null && (b.remaining ?? 0) > 0 && (
                  <> · quedan {weeksLeft} semanas de año para colocarlos</>
                )}
              </span>
            </div>
          );
        })}
        {carry && (carry.late || (carry.remaining ?? 0) > 0) ? (
          <p className="note warn">
            Vacaciones del año anterior: hasta el {formatLong(carry.expiry!)}.
            {(carry.remaining ?? 0) > 0 &&
              (today > carry.expiry! ? ` Se han perdido ${carry.remaining}.` : ` Quedan ${carry.remaining} por colocar.`)}
            {(carry.late ?? 0) > 0 && ` Hay ${carry.late} anotadas después de esa fecha.`}
          </p>
        ) : null}

        {mi >= 0 && total > 0 && (
          <>
            <h3>Por meses</h3>
            <div className="months" role="img" aria-label={`Días de ausencia por mes de ${p.name}`}>
              {months[mi].map((m, k) => (
                <span key={k} className={`mcol${year === +today.slice(0, 4) && k === +today.slice(5, 7) - 1 ? ' now' : ''}`}>
                  <span className="mbar">
                    <Seg n={m.planned} of={maxMonth} color={personColor(config.people, p.name)} planned vertical />
                    <Seg n={m.spent} of={maxMonth} color={personColor(config.people, p.name)} vertical />
                  </span>
                  <small>{m.spent + m.planned || ''}</small>
                  <em>{MONTHS[k][0]}</em>
                </span>
              ))}
            </div>
          </>
        )}

        {total > 0 && (
          <>
            <h3>Reparto</h3>
            <Distribution counts={counts} total={total} />
          </>
        )}
      </section>
    );
  };

  const cov = coverers(config, grid, year, today);
  const maxCov = Math.max(1, ...cov.list.map((c) => c.spent + c.planned));
  const sumCov = cov.list.reduce((n, c) => n + c.spent + c.planned, 0) || 1;

  return (
    <div className="cards stats">
      {adults.map((p, i) => card(p, i))}

      <section className="card">
        <h2>Quién ha cubierto en {year}</h2>
        <p className="muted">
          {cov.needed
            ? `${days(cov.needed)} laborables con algún niño sin cole o malo${cov.uncovered ? `; ${cov.uncovered} sin cubrir` : ''}.`
            : 'Ningún día con niños en casa anotado este año.'}
        </p>
        {cov.list.map((c) => (
          <div key={c.key} className="hbar">
            <span className="hlabel">
              {c.person ? <Avatar people={config.people} name={c.person} size={22} /> : <span className="sw" style={{ background: c.color }} />}
              {c.label}
            </span>
            <span className="htrack">
              <Seg n={c.spent} of={maxCov} color={c.person ? personColor(config.people, c.person) : c.color} />
              <Seg n={c.planned} of={maxCov} color={c.person ? personColor(config.people, c.person) : c.color} planned />
            </span>
            <b className="hnum">
              {fmt(c.spent + c.planned)}
              <small>{Math.round(((c.spent + c.planned) / sumCov) * 100)}%</small>
            </b>
          </div>
        ))}
        {cov.list.length > 0 && <Key />}
      </section>

      {others.map((p) => card(p))}
      <p className="muted center-text">Los días disponibles y los permisos se configuran en Ajustes.</p>
    </div>
  );
}

/** Barra apilada con un tramo por tipo y su leyenda. */
function Distribution({ counts, total }: { counts: CodeCount[]; total: number }) {
  return (
    <>
      <span className="htrack tall stack" role="img" aria-label={counts.map((c) => `${c.code.desc}: ${c.spent + c.planned}`).join(', ')}>
        {counts.map((c) => (
          <span key={c.code.code} style={{ width: `${((c.spent + c.planned) / total) * 100}%`, background: c.code.color }} />
        ))}
      </span>
      <ul className="dist">
        {counts.map((c) => (
          <li key={c.code.code}>
            <i style={{ background: c.code.color }}>{c.code.code}</i>
            <span className="dname">{c.code.desc}</span>
            <span className="dnum">
              <b>{c.spent + c.planned}</b>
              {c.planned > 0 && <small> ({c.planned} por venir)</small>}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Seg({ n, of, color, planned, vertical }: { n: number; of: number; color: string; planned?: boolean; vertical?: boolean }) {
  if (!(n > 0)) return null;
  const size = `${Math.min(100, (n / of) * 100)}%`;
  return <span className={planned ? 'planned' : ''} style={{ [vertical ? 'height' : 'width']: size, background: color }} />;
}

function Key() {
  return (
    <p className="key">
      <span className="k" /> hasta hoy <span className="k planned" /> planificado
    </p>
  );
}
