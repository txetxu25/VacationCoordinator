import { formatLong } from '../domain/dates';
import { analyzeLeave, fmt } from '../domain/leave';
import { balances, holidayChecker } from '../domain/logic';
import { type CodeCount, codeCounts, coverers, isAbsence, isSick } from '../domain/stats';
import type { Store } from '../store';
import { Avatar, personColor } from './look';

/**
 * Pestaña de solo lectura: cómo se reparten los días de cada persona, lo que queda de lo disponible
 * (se fija en Ajustes) y quién ha cubierto los días en que los niños necesitaban a alguien.
 */
export function Balances({ store, year, today }: { store: Store; year: number; today: string }) {
  const { config } = store;
  const grid = store.grid(year);
  const isHoliday = holidayChecker(config);
  const prevGrid = store.years.includes(year - 1) ? store.grid(year - 1) : undefined;
  const cov = coverers(config, grid, year, today);
  const maxCov = Math.max(1, ...cov.list.map((c) => c.spent + c.planned));
  const days = (n: number) => `${fmt(n)} ${n === 1 ? 'día' : 'días'}`;

  return (
    <div className="cards stats">
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
            <b className="hnum">{fmt(c.spent + c.planned)}</b>
          </div>
        ))}
        {cov.list.length > 0 && <Key />}
      </section>

      {config.people.map((p) => {
        const all = codeCounts(config, grid, year, p, today);
        // El teletrabajo no es una ausencia: va aparte y no entra en el reparto
        const counts = all.filter((c) => isAbsence(c.code, p.role));
        const remote = all.find((c) => !isAbsence(c.code, p.role));
        const total = counts.reduce((n, c) => n + c.spent + c.planned, 0);
        const noun = p.role === 'abuelos' ? 'cubriendo' : p.role === 'niño' ? 'en casa' : 'de ausencia';
        const sick = counts.filter((c) => isSick(c.code));
        const sickDays = sick.reduce((n, c) => n + (c.spent + c.planned) * (c.code.weight === 0.5 ? 0.5 : 1), 0);
        const quotas = p.role === 'adulto' ? balances(config, grid, year, p, today, prevGrid).filter((b) => b.available != null) : [];
        const carry = quotas.find((b) => b.expiry);
        const leaves = config.leaveTypes.filter((t) => t.person === p.name);
        return (
          <section key={p.name} className="card">
            <h2 className="who">
              <Avatar people={config.people} name={p.name} size={34} />
              <span>
                {p.name}
                <small>{total ? `${days(total)} ${noun}` : 'Nada anotado'}{remote ? ` · ${days(remote.spent + remote.planned)} de teletrabajo` : ''}</small>
              </span>
            </h2>

            {sickDays > 0 && (
              <p className="pill sick">
                {p.role === 'niño' ? 'Malo' : 'De baja'}: <b>{days(sickDays)}</b>
              </p>
            )}

            {quotas.map((b) => {
              const top = Math.max(b.available ?? 0, b.spent + b.planned, 1);
              return (
                <div key={b.code.code} className="meter">
                  <div className="mtop">
                    <span className="mname"><i style={{ background: b.code.color }}>{b.code.code}</i> {b.code.desc}</span>
                    <span className={`mleft${(b.remaining ?? 0) < 0 ? ' neg' : ''}`}>
                      <b>{fmt(b.remaining ?? 0)}</b> de {fmt(b.available ?? 0)} quedan
                    </span>
                  </div>
                  <span className="htrack tall">
                    <Seg n={b.spent} of={top} color={b.code.color} />
                    <Seg n={b.planned} of={top} color={b.code.color} planned />
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

            {total > 0 && (
              <>
                <h3>Reparto</h3>
                <Distribution counts={counts} total={total} />
              </>
            )}

            {leaves.map((t) => {
              const a = analyzeLeave(config.birth, t, config.leaves, isHoliday);
              return (
                <p key={t.name} className="note">
                  {t.name}: planificado {fmt(a.used)} de {fmt(t.amount)} {t.unit}; sin planificar, {fmt(a.remaining)}.
                </p>
              );
            })}
          </section>
        );
      })}
      <p className="muted center-text">Los días disponibles de cada tipo se fijan en Ajustes.</p>
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

function Seg({ n, of, color, planned }: { n: number; of: number; color: string; planned?: boolean }) {
  if (!(n > 0)) return null;
  return <span className={planned ? 'planned' : ''} style={{ width: `${Math.min(100, (n / of) * 100)}%`, background: color }} />;
}

function Key() {
  return (
    <p className="key">
      <span className="k" /> hasta hoy <span className="k planned" /> planificado
    </p>
  );
}
