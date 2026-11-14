import { useCallback, useEffect, useRef, useState } from 'react';
import { consumeRedirect, getToken, login, logout } from '../backend/auth';
import { AuthError, GoogleBackend } from '../backend/google';
import { MemoryBackend } from '../backend/memory';
import { MONTHS, todayIso } from '../domain/dates';
import { Store } from '../store';
import { Balances } from './Balances';
import { Calendar } from './Calendar';
import { LegacyImport } from './LegacyImport';
import { SettingsView } from './SettingsView';
import { Setup } from './Setup';
import { type Settings, loadSettings, saveSettings } from './settings';

type Tab = 'calendario' | 'saldos' | 'ajustes';

// Se evalúa una sola vez al cargar: recoge el token si volvemos de Google.
const redirectResult = consumeRedirect();

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [store, setStore] = useState<Store | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setVersion] = useState(0);
  const [tab, setTab] = useState<Tab>('calendario');
  const today = todayIso();
  const [year, setYear] = useState(+today.slice(0, 4));
  const [month, setMonth] = useState(+today.slice(5, 7));
  const redirectError = useRef(redirectResult);

  const fail = useCallback((e: unknown) => {
    if (e instanceof AuthError) setNeedLogin(true);
    else setError((e as Error).message || String(e));
  }, []);

  /** Ejecuta una operación contra la hoja mostrando estado y errores. */
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError('');
      try {
        await fn();
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
        setVersion((v) => v + 1);
      }
    },
    [fail],
  );

  // Conexión inicial
  useEffect(() => {
    setStore(null);
    setNeedLogin(false);
    if (!settings.mode) return;
    if (redirectError.current) {
      setError(redirectError.current);
      redirectError.current = '';
    }
    if (settings.mode === 'google' && !getToken()) {
      setNeedLogin(true);
      return;
    }
    const backend =
      settings.mode === 'demo' ? new MemoryBackend('vc-demo') : new GoogleBackend(settings.spreadsheetId, getToken);
    const s = new Store(backend);
    run(async () => {
      await s.init();
      if (!s.years.includes(year)) {
        // Sin hoja para el año en curso: ir al siguiente año gestionado (o al que toca crear).
        const y = s.years.find((y) => y > year) ?? s.years[s.years.length - 1] ?? year;
        if (y !== year) {
          setYear(y);
          setMonth(y > year ? 1 : 12);
        }
      }
      setStore(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, run]);

  // Al volver a la app, releer por si la otra persona ha cambiado algo
  useEffect(() => {
    if (!store) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') run(() => store.refresh(year));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [store, year, run]);

  const update = (s: Settings) => {
    saveSettings(s);
    setSettings(s);
  };

  if (!settings.mode) return <Setup settings={settings} onSave={update} />;

  if (needLogin)
    return (
      <main className="center">
        <h1>Coordinador de vacaciones</h1>
        {error && <p className="error">{error}</p>}
        <p>Inicia sesión con la cuenta de Google que tiene acceso a la hoja de cálculo.</p>
        <button className="primary" onClick={() => login(settings.clientId)}>
          Iniciar sesión con Google
        </button>
        <button className="link" onClick={() => update({ ...settings, mode: '' })}>
          Cambiar configuración
        </button>
      </main>
    );

  if (!store)
    return (
      <main className="center">
        {error ? <p className="error">{error}</p> : <p>Cargando…</p>}
        {error && (
          <button className="link" onClick={() => update({ ...settings, mode: '' })}>
            Cambiar configuración
          </button>
        )}
      </main>
    );

  const hasYear = store.years.includes(year);
  const move = (delta: number) => {
    let m = month + delta;
    let y = year;
    while (m < 1) [m, y] = [m + 12, y - 1];
    while (m > 12) [m, y] = [m - 12, y + 1];
    setMonth(m);
    setYear(y);
  };

  return (
    <>
      <header>
        <div className="monthnav">
          <button onClick={() => move(tab === 'calendario' ? -1 : -12)} aria-label="Anterior">‹</button>
          <strong>
            {tab === 'calendario' ? `${MONTHS[month - 1]} ` : ''}
            {year}
          </strong>
          <button onClick={() => move(tab === 'calendario' ? 1 : 12)} aria-label="Siguiente">›</button>
        </div>
        <span className="status">
          {busy ? 'Guardando…' : settings.mode === 'demo' ? 'Modo demo' : ''}
        </span>
      </header>

      {error && (
        <p className="error" onClick={() => setError('')}>
          {error}
        </p>
      )}
      {store.warning && (
        <p className="warn" onClick={() => { store.warning = ''; setVersion((v) => v + 1); }}>
          {store.warning}
        </p>
      )}

      <main>
        {!hasYear && tab !== 'ajustes' ? (
          <div className="center">
            {store.legacy.includes(String(year)) ? (
              <LegacyImport store={store} title={String(year)} run={run} busy={busy} />
            ) : (
              <>
                <p>Todavía no existe la hoja {year}.</p>
                <button className="primary" disabled={busy} onClick={() => run(() => store.createYear(year))}>
                  Crear hoja {year}
                </button>
              </>
            )}
            {store.years.length > 0 && (
              <button className="link" onClick={() => { setYear(store.years[0]); setMonth(1); }}>
                Ir a {store.years[0]}
              </button>
            )}
          </div>
        ) : tab === 'calendario' ? (
          <Calendar
            store={store}
            year={year}
            month={month}
            today={today}
            onGo={(date) => { setYear(+date.slice(0, 4)); setMonth(+date.slice(5, 7)); }}
            run={run}
          />
        ) : tab === 'saldos' ? (
          <Balances store={store} year={year} today={today} run={run} />
        ) : (
          <SettingsView
            store={store}
            year={year}
            hasYear={hasYear}
            run={run}
            busy={busy}
            onDisconnect={() => { logout(); update({ ...settings, mode: '' }); }}
          />
        )}
      </main>

      <nav>
        {(['calendario', 'saldos', 'ajustes'] as Tab[]).map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
    </>
  );
}

export type Run = (fn: () => Promise<void>) => Promise<void>;
