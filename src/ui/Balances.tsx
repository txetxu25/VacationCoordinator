import { formatLong } from '../domain/dates';
import { analyzeLeave, fmt } from '../domain/leave';
import { balances, holidayChecker } from '../domain/logic';
import type { Store } from '../store';
import type { Run } from './App';
import { Avatar } from './look';

export function Balances({ store, year, today, run }: { store: Store; year: number; today: string; run: Run }) {
  const { config } = store;
  const grid = store.grid(year);
  const isHoliday = holidayChecker(config);
  const prevGrid = store.years.includes(year - 1) ? store.grid(year - 1) : undefined;

  const setQuota = (person: string, code: string, text: string) => {
    const quotas = config.quotas.filter((q) => !(q.year === year && q.person === person && q.code === code));
    const n = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(n)) quotas.push({ year, person, code, available: n });
    run(() => store.saveConfigOnly({ ...config, quotas }));
  };

  return (
    <div className="cards">
      {config.people.map((p) => {
        const rows = balances(config, grid, year, p, today, prevGrid);
        const carry = rows.find((b) => b.expiry);
        const leaves = config.leaveTypes.filter((t) => t.person === p.name);
        const adult = p.role === 'adulto';
        return (
          <section key={p.name} className="card">
            <h2 className="who">
              <Avatar people={config.people} name={p.name} size={34} />
              {p.name}
            </h2>
            {(() => {
              const quota = (b: (typeof rows)[number]) => (
                <input
                  key={`${year}-${b.available}-${b.auto}`}
                  className="quota"
                  inputMode="decimal"
                  aria-label={`Disponibles ${b.code.desc} ${p.name}`}
                  defaultValue={b.auto ? '' : b.available ?? ''}
                  placeholder={b.auto ? String(b.available) : '–'}
                  title={b.auto ? 'Calculado: lo que quedó sin gastar el año anterior' : undefined}
                  onBlur={(e) => {
                    if (e.target.value !== String(b.auto ? '' : b.available ?? '')) setQuota(p.name, b.code.code, e.target.value);
                  }}
                />
              );
              const shown = rows.filter((b) => b.available != null || b.spent + b.planned > 0);
              const others = adult ? rows.filter((b) => !shown.includes(b)) : [];
              return (
                <>
                  {shown.map((b) => {
                    const total = Math.max(b.available ?? 0, b.spent + b.planned, 1);
                    const pct = (n: number) => `${Math.min(100, (n / total) * 100)}%`;
                    return (
                      <div key={b.code.code} className="meter">
                        <div className="mtop">
                          <span className="mname">
                            <i style={{ background: b.code.color }}>{b.code.code}</i> {b.code.desc}
                          </span>
                          {b.remaining != null ? (
                            <span className={`mleft${b.remaining < 0 ? ' neg' : ''}`}>
                              <b>{b.remaining}</b> {Math.abs(b.remaining) === 1 ? 'queda' : 'quedan'}
                            </span>
                          ) : (
                            <span className="mleft"><b>{b.spent + b.planned}</b> {b.spent + b.planned === 1 ? 'día' : 'días'}</span>
                          )}
                        </div>
                        {b.available != null && (
                          <div className="bar" role="img" aria-label={`${b.spent} gastados y ${b.planned} planificados de ${b.available}`}>
                            <span className="spent" style={{ width: pct(b.spent), background: b.code.color }} />
                            <span className="planned" style={{ width: pct(b.planned), background: b.code.color }} />
                          </div>
                        )}
                        <div className="msub">
                          {b.spent} {b.spent === 1 ? 'gastado' : 'gastados'} · {b.planned} {b.planned === 1 ? 'planificado' : 'planificados'}
                          {adult && <> · de {quota(b)}</>}
                        </div>
                      </div>
                    );
                  })}
                  {!shown.length && <p className="muted">Sin días anotados en {year}.</p>}
                  {others.length > 0 && (
                    <details className="others">
                      <summary>Fijar cupo de otros tipos</summary>
                      {others.map((b) => (
                        <div key={b.code.code} className="orow">
                          <span><i style={{ background: b.code.color }}>{b.code.code}</i> {b.code.desc}</span>
                          {quota(b)}
                        </div>
                      ))}
                    </details>
                  )}
                </>
              );
            })()}
            {carry && carry.available != null && (
              <p className={`note${(carry.late ?? 0) > 0 || (carry.remaining ?? 0) > 0 ? ' warn inline' : ''}`}>
                Vacaciones del año anterior{carry.auto ? ` (${carry.available}, calculadas)` : ''}: se pueden gastar hasta
                el {formatLong(carry.expiry!)}.
                {(carry.remaining ?? 0) > 0 &&
                  (today > carry.expiry!
                    ? ` Se han perdido ${carry.remaining}.`
                    : ` Quedan ${carry.remaining} por colocar.`)}
                {(carry.late ?? 0) > 0 && ` Hay ${carry.late} anotadas después de esa fecha.`}
              </p>
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
    </div>
  );
}
