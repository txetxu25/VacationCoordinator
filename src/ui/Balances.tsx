import { CODE_BIRTH_LEAVE } from '../domain/defaults';
import { formatLong } from '../domain/dates';
import { analyzeLeave } from '../domain/leave';
import { balances } from '../domain/logic';
import type { Store } from '../store';
import type { Run } from './App';

const adult0 = (role: string) => role === 'adulto';

export function Balances({ store, year, today, run }: { store: Store; year: number; today: string; run: Run }) {
  const { config } = store;
  const grid = store.grid(year);
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
        const leave = adult0(p.role) && config.rules.birth ? analyzeLeave(config.rules, config.leaves, p.name) : null;
        const adult = p.role === 'adulto';
        return (
          <section key={p.name} className="card">
            <h2>{p.name}</h2>
            <table className="bal">
              <thead>
                <tr>
                  <th>Tipo</th>
                  {adult && <th>Disponibles</th>}
                  <th>Gastados</th>
                  <th>Planificados</th>
                  {adult && <th>Quedan</th>}
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((b) => adult || b.spent + b.planned > 0)
                  .map((b) => (
                    <tr key={b.code.code}>
                      <td>
                        <i style={{ background: b.code.color }}>{b.code.code}</i> {b.code.desc}
                      </td>
                      {adult && (
                        <td>
                          <input
                            key={`${year}-${b.available}-${b.auto}`}
                            inputMode="decimal"
                            aria-label={`Disponibles ${b.code.desc} ${p.name}`}
                            defaultValue={b.auto ? '' : b.available ?? ''}
                            placeholder={b.auto ? String(b.available) : '–'}
                            title={b.auto ? 'Calculado: lo que quedó sin gastar el año anterior' : undefined}
                            onBlur={(e) => {
                              if (e.target.value !== String(b.auto ? '' : b.available ?? '')) setQuota(p.name, b.code.code, e.target.value);
                            }}
                          />
                        </td>
                      )}
                      <td>{b.spent}</td>
                      <td>{b.planned}</td>
                      {adult && (
                        <td className={b.remaining != null && b.remaining < 0 ? 'neg' : ''}>{b.remaining ?? '–'}</td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
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
            {leave && (
              <p className="note">
                Permiso por nacimiento ({CODE_BIRTH_LEAVE}): {leave.used} de {config.rules.total} semanas planificadas,
                quedan {leave.remaining}.
              </p>
            )}
            {!adult && rows.every((b) => b.spent + b.planned === 0) && <p className="muted">Sin días anotados en {year}.</p>}
          </section>
        );
      })}
    </div>
  );
}
