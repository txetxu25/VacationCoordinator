import { useCallback, useEffect, useRef, useState } from 'react';
import { canRenewSilently, consumeRedirect, getToken, login, logout, msUntilRenewal } from '../backend/auth';
import { AuthError, GoogleBackend } from '../backend/google';
import { MemoryBackend } from '../backend/memory';
import { MONTHS, todayIso } from '../domain/dates';
import { Store } from '../store';
import { Balances } from './Balances';
import { Calendar } from './Calendar';
import { Leave } from './Leave';
import { LegacyImport } from './LegacyImport';
import { SettingsView } from './SettingsView';
import { Setup } from './Setup';
import { confirmLeave, hasUnsavedChanges } from './dirty';
import { useSwipe } from './swipe';
import { newerBuild, reloadTo } from './update';
import { YearView } from './YearView';
import { Upcoming } from './Upcoming';
import { TabBar } from './TabBar';
import { type Settings, loadSettings, saveSettings } from './settings';

type Tab = 'próximos' | 'calendario' | 'año' | 'saldos' | 'ajustes';
const TABS: Tab[] = ['próximos', 'calendario', 'año', 'saldos', 'ajustes'];
type SettingsPage = 'general' | 'permisos';

// Pestaña y mes en pantalla: se conservan si hay que pasar por Google para renovar la sesión.
const VIEW_KEY = 'vc-view';
function savedView(): { tab: Tab; year: number; month: number } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? 'null');
    if (v?.tab === 'permiso') v.tab = 'ajustes'; // la pestaña Permiso pasó a Ajustes
    return v && TABS.includes(v.tab) && v.year && v.month ? v : null;
  } catch {
    return null;
  }
}

// Se evalúa una sola vez al cargar: recoge el token si volvemos de Google.
const redirectResult = consumeRedirect();

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [store, setStore] = useState<Store | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [expired, setExpired] = useState(false);
  const [newBuild, setNewBuild] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setVersion] = useState(0);
  const today = todayIso();
  const [view] = useState(savedView);
  const [tab, setTabState] = useState<Tab>(view?.tab ?? 'próximos');
  const [page, setPage] = useState<SettingsPage>('general');
  const [slide, setSlide] = useState<'' | 'from-right' | 'from-left'>('');
  // El elemento cambia al cambiar de pestaña (se vuelve a montar para animar): se sigue con estado, no con ref
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);

  /** Cambiar de pestaña, con animación en el sentido del movimiento y sin perder cambios por sorpresa. */
  const setTab = useCallback(
    (next: Tab) => {
      if (next === tabRef.current || !confirmLeave()) return;
      setSlide(TABS.indexOf(next) > TABS.indexOf(tabRef.current) ? 'from-right' : 'from-left');
      setTabState(next);
      window.scrollTo(0, 0);
    },
    [],
  );
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const onSwipe = useCallback(
    (dir: 1 | -1) => {
      const next = TABS[TABS.indexOf(tabRef.current) + dir];
      if (next) setTab(next);
    },
    [setTab],
  );
  useSwipe(mainEl, onSwipe);
  const [year, setYear] = useState(view?.year ?? +today.slice(0, 4));
  const [month, setMonth] = useState(view?.month ?? +today.slice(5, 7));
  const redirectError = useRef(redirectResult.error);
  const latest = useRef({ store, year });
  latest.current = { store, year };

  useEffect(() => {
    sessionStorage.setItem(VIEW_KEY, JSON.stringify({ tab, year, month }));
  }, [tab, year, month]);

  /** Renueva la sesión sin preguntar si es posible; si no, enseña el botón de inicio de sesión. */
  const renew = useCallback(() => {
    if (settings.mode !== 'google') return;
    if (canRenewSilently()) login(settings.clientId, true);
    else setNeedLogin(true);
  }, [settings]);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) {
        // Con cambios sin guardar no se recarga la página sin avisar
        if (hasUnsavedChanges()) setExpired(true);
        else renew();
      }
      else setError((e as Error).message || String(e));
    },
    [renew],
  );

  /** Ejecuta una operación contra la hoja mostrando estado y errores. */
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError('');
      try {
        const pending = fn();
        // El cambio ya está en memoria: se pinta al momento en todas las vistas, sin esperar a Google
        setVersion((v) => v + 1);
        await pending;
      } catch (e) {
        fail(e);
        // Si no se pudo guardar, se vuelve a leer la hoja para no mostrar algo que no está guardado
        const { store: s, year: y } = latest.current;
        if (s && !(e instanceof AuthError)) await s.refresh(y).catch(() => {});
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
      if (!redirectResult.silentFailed && !redirectError.current && canRenewSilently()) login(settings.clientId, true);
      else setNeedLogin(true);
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
      if (document.visibilityState !== 'visible') return;
      if (settings.mode === 'google' && !getToken()) {
        if (hasUnsavedChanges()) setExpired(true);
        else renew();
      } else if (!hasUnsavedChanges()) run(() => store.refresh(year));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [store, year, run, renew, settings]);

  // ¿Hay una versión nueva publicada? Se mira al abrir y cada vez que se vuelve a la app.
  useEffect(() => {
    const check = async () => {
      const build = await newerBuild();
      if (!build) return;
      if (hasUnsavedChanges() || !reloadTo(build)) setNewBuild(build);
    };
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Renovar la sesión poco antes de que caduque el token, sin esperar a que falle una operación
  useEffect(() => {
    if (!store || settings.mode !== 'google') return;
    const ms = msUntilRenewal();
    if (ms == null) return;
    const timer = setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      if (hasUnsavedChanges()) setExpired(true);
      else renew();
    }, Math.max(ms, 5_000));
    return () => clearTimeout(timer);
  }, [store, settings, renew]);

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
  // En «Próximos» manda el año de hoy, no el elegido arriba
  const shownYear = tab === 'próximos' ? +today.slice(0, 4) : year;
  const monthly = tab === 'calendario';
  const needsYear = tab === 'calendario' || tab === 'año' || tab === 'saldos' || tab === 'próximos';
  const goTo = (date: string) => {
    setYear(+date.slice(0, 4));
    setMonth(+date.slice(5, 7));
    setTab('calendario');
  };
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
        <div className="htitle">
          <strong>{tab === 'próximos' ? 'Próximos días' : tab === 'ajustes' ? 'Ajustes' : monthly ? MONTHS[month - 1] : year}</strong>
          {monthly && <span>{year}</span>}
          {(busy || settings.mode === 'demo') && (
            <span className={`status${busy ? ' busy' : ''}`}>{busy ? 'Guardando…' : 'Demo'}</span>
          )}
        </div>
        <div className="monthnav" hidden={tab === 'próximos'}>
          {(monthly ? `${year}-${String(month).padStart(2, '0')}` : String(year)) !== (monthly ? today.slice(0, 7) : today.slice(0, 4)) && (
            <button
              className="today"
              onClick={() => { setYear(+today.slice(0, 4)); setMonth(+today.slice(5, 7)); }}
            >
              Hoy
            </button>
          )}
          <button onClick={() => move(monthly ? -1 : -12)} aria-label="Anterior">‹</button>
          <button onClick={() => move(monthly ? 1 : 12)} aria-label="Siguiente">›</button>
        </div>
      </header>

      {error && (
        <p className="error" onClick={() => setError('')}>
          {error}
        </p>
      )}
      {newBuild && (
        <p className="warn">
          Hay una versión nueva de la app.{' '}
          <button onClick={() => confirmLeave() && reloadTo(newBuild, true)}>Actualizar</button>
        </p>
      )}
      {expired && (
        <p className="warn">
          La sesión de Google necesita renovarse y hay cambios sin guardar, que se perderán al hacerlo.{' '}
          <button onClick={renew}>Renovar sesión</button>
        </p>
      )}
      {store.warning && (
        <p className="warn" onClick={() => { store.warning = ''; setVersion((v) => v + 1); }}>
          {store.warning}
        </p>
      )}

      <main ref={setMainEl} key={tab} className={slide}>
        {!store.years.includes(shownYear) && needsYear ? (
          <div className="center">
            {store.legacy.includes(String(shownYear)) ? (
              <LegacyImport store={store} source={String(shownYear)} run={run} busy={busy} />
            ) : (
              <>
                <p>Todavía no existe la hoja {shownYear}.</p>
                <button className="primary" disabled={busy} onClick={() => run(() => store.createYear(shownYear))}>
                  Crear hoja {shownYear}
                </button>
              </>
            )}
            {store.years.length > 0 && (
              <button className="link" onClick={() => { setYear(store.years[0]); setMonth(1); }}>
                Ir a {store.years[0]}
              </button>
            )}
          </div>
        ) : tab === 'próximos' ? (
          <Upcoming store={store} today={today} onGo={goTo} />
        ) : tab === 'calendario' ? (
          <Calendar
            store={store}
            year={year}
            month={month}
            today={today}
            onGo={goTo}
            run={run}
          />
        ) : tab === 'año' ? (
          <YearView store={store} year={year} today={today} onGo={goTo} />
        ) : tab === 'saldos' ? (
          <Balances store={store} year={year} today={today} />
        ) : (
          <>
            <div className="segmented subnav" role="tablist" aria-label="Secciones de ajustes">
              {(['general', 'permisos'] as SettingsPage[]).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={p === page}
                  className={p === page ? 'active' : ''}
                  onClick={() => p !== page && confirmLeave() && setPage(p)}
                >
                  {p === 'general' ? 'General' : 'Permisos'}
                </button>
              ))}
            </div>
            {page === 'permisos' ? (
              <Leave store={store} run={run} busy={busy} />
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
          </>
        )}
      </main>

      <TabBar
        tabs={TABS}
        active={tab}
        label={(t) => (t === 'próximos' ? 'Próximos' : t[0].toUpperCase() + t.slice(1))}
        onSelect={setTab}
      />
    </>
  );
}

export type Run = (fn: () => Promise<void>) => Promise<void>;
