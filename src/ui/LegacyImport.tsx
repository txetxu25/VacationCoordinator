import { useEffect, useState } from 'react';
import { guessMapping } from '../domain/legacy';
import type { Store } from '../store';
import type { Run } from './App';

/** Pasa una hoja de año rellenada a mano al formato de la app, para poder editarla desde aquí. */
export function LegacyImport({ store, title, run, busy }: { store: Store; title: string; run: Run; busy: boolean }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const people = store.config.people.map((p) => p.name);

  useEffect(() => {
    let alive = true;
    setNames(null);
    store.readLegacy(title).then(
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
  }, [store, title]);

  if (error) return <p className="error">{error}</p>;
  if (!names) return <p>Leyendo la hoja {title}…</p>;

  const targets = Object.values(mapping).filter(Boolean);
  const duplicated = new Set(targets).size !== targets.length;

  return (
    <section className="card import">
      <h2>Importar {title} a la app</h2>
      <p className="muted">
        Indica a quién corresponde cada fila de la hoja antigua. La hoja actual se conserva con el nombre «{title}{' '}
        original» y se crea una nueva «{title}» con los mismos datos, editable desde la app.
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
      <button
        className="primary"
        disabled={busy || duplicated || targets.length === 0}
        onClick={() => run(() => store.importLegacy(title, mapping))}
      >
        Importar {title}
      </button>
    </section>
  );
}
