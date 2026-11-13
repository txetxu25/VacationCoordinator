import { balances } from '../domain/logic';
import type { Store } from '../store';
import type { Run } from './App';

export function Balances({ store, year, today, run }: { store: Store; year: number; today: string; run: Run }) {
  const { config } = store;
  const grid = store.grid(year);

  const setQuota = (person: string, code: string, text: string) => {
    const quotas = config.quotas.filter((q) => !(q.year === year && q.person === person && q.code === code));
    const n = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(n)) quotas.push({ year, person, code, available: n });
    run(() => store.saveConfigOnly({ ...config, quotas }));
  };

  return (
    <div className="cards">
      {config.people.map((p) => {
        const rows = balances(config, grid, year, p, today);
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
                            key={`${year}-${b.available}`}
                            inputMode="decimal"
                            aria-label={`Disponibles ${b.code.desc} ${p.name}`}
                            defaultValue={b.available ?? ''}
                            placeholder="–"
                            onBlur={(e) => {
                              if (e.target.value !== String(b.available ?? '')) setQuota(p.name, b.code.code, e.target.value);
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
            {!adult && rows.every((b) => b.spent + b.planned === 0) && <p className="muted">Sin días anotados en {year}.</p>}
          </section>
        );
      })}
    </div>
  );
}
