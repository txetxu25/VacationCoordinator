import { MONTHS, daysInMonth, isWeekend, iso } from '../domain/dates';
import { coverage, displayCode, uncoveredDays } from '../domain/logic';
import type { Store } from '../store';

/** El año entero en una pantalla: un bloque por mes, una fila por persona, un cuadro por día. */
export function YearView({ store, year, today, onGo }: { store: Store; year: number; today: string; onGo: (date: string) => void }) {
  const { config } = store;
  const grid = store.grid(year);
  const pending = uncoveredDays(config, grid, year, today).length;
  const all = uncoveredDays(config, grid, year).length;
  const dayNumbers = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="cards">
      <div className={pending ? 'banner' : 'banner ok'}>
        {pending
          ? `${pending} ${pending === 1 ? 'día sin cubrir' : 'días sin cubrir'} de aquí a fin de año (marcados en rojo).`
          : all
            ? 'Nada pendiente de cubrir de aquí a fin de año.'
            : 'Todo el año cubierto.'}
      </div>
      {MONTHS.map((name, i) => {
        const m = i + 1;
        const max = daysInMonth(year, m);
        return (
          <section key={m} className="card month">
            <button className="monthtitle" onClick={() => onGo(iso(year, m, 1))}>
              {name} <span aria-hidden>›</span>
            </button>
            <div className="ygrid" role="img" aria-label={`Resumen de ${name}`}>
              <span />
              {dayNumbers.map((d) => {
                const date = iso(year, m, d);
                const bad = d <= max && coverage(config, grid, date).uncovered;
                return (
                  <span key={d} className={`ynum${bad ? ' bad' : ''}${date === today ? ' now' : ''}`}>
                    {d <= max && (d === 1 || d % 5 === 0 || bad) ? d : ''}
                  </span>
                );
              })}
              {config.people.map((p) => (
                <YearRow key={p.name} label={p.name}>
                  {dayNumbers.map((d) => {
                    if (d > max) return <span key={d} />;
                    const date = iso(year, m, d);
                    const code = grid[p.name]?.[date];
                    const color = code ? displayCode(config, p, code)?.color ?? '#bbb' : undefined;
                    return (
                      <span
                        key={d}
                        className={`ycell${isWeekend(date) ? ' we' : ''}`}
                        style={color ? { background: color } : undefined}
                        title={code ? `${p.name} ${d}: ${code}` : undefined}
                      />
                    );
                  })}
                </YearRow>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function YearRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="ylabel">{label}</span>
      {children}
    </>
  );
}
