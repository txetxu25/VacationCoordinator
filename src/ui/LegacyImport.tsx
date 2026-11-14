import { useEffect, useState } from 'react';
import { guessMapping } from '../domain/legacy';
import type { Store } from '../store';
import type { Run } from './App';

/**
 * Pasa una hoja de año rellenada a mano al formato de la app.
 * `source` es la hoja antigua: "2026" (primera importación) o "2026 original" (traer lo que faltó).
 */
export function LegacyImport({ store, source, run, busy }: { store: Store; source: string; run: Run; busy: boolean }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const year = parseInt(source, 10);
  const merging = store.years.includes(year);
  const people = store.config.people.map((p) => p.name);

  useEffect(() => {
    let alive = true;
    setNames(null);
    store.readLegacy(source).then(
      (l) => {
        if (!alive) return;
        setNames(l.people);
        setMapping(guessMapping(l.people, store.config.people.map((p) => p.name)));
      },
      (e) => alive && setError((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [store, source]);

  if (error) return <p className="error">{error}</p>;
  if (!names) return <p>Leyendo la hoja {source}…</p>;

  const targets = Object.values(mapping).filter(Boolean);
  const duplicated = new Set(targets).size !== targets.length;
  const unassigned = names.filter((n) => !mapping[n]);

  return (
    <section className="card import">
      <h2>{merging ? `Completar ${year} desde «${source}»` : `Importar ${year} a la app`}</h2>
      <p className="muted">
        Indica a quién corresponde cada fila de la hoja antigua.{' '}
        {merging
          ? 'Solo se rellenan las celdas que estén vacías en la app; lo ya anotado no se toca.'
          : `La hoja actual se conserva con el nombre «${source} original» y se crea una nueva «${source}» con los mismos datos, editable desde la app.`}
      </p>
      <table className="edit">
        <thead>
          <tr><th>En la hoja</th><th>En la app</th></tr>
        </thead>
        <tbody>
          {names.map((n) => (
            <tr key={n}>
              <td>{n}</td>
              <td>
                <select aria-label={`Persona para ${n}`} value={mapping[n] ?? ''} onChange={(e) => setMapping({ ...mapping, [n]: e.target.value })}>
                  <option value="">No importar</option>
                  {people.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {duplicated && <p className="error">Hay dos filas asignadas a la misma persona.</p>}
      {unassigned.length > 0 && (
        <p className="warn inline">Sin asignar, no se importarán: {unassigned.join(', ')}.</p>
      )}
      <button
        className="primary"
        disabled={busy || duplicated || targets.length === 0}
        onClick={() => run(() => store.importLegacy(source, mapping))}
      >
        {merging ? `Completar ${year}` : `Importar ${year}`}
      </button>
    </section>
  );
}
