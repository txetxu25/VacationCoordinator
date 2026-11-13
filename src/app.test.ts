import { describe, expect, it } from 'vitest';
import { MemoryBackend } from './backend/memory';
import { defaultConfig } from './domain/defaults';
import { parseDate, weekday } from './domain/dates';
import { balances, coverage, specialDays, uncoveredDays } from './domain/logic';
import { buildYear, colLetter, parseConfig, parseYear, serializeConfig, textToTelework } from './domain/sheet';
import type { Config, Grid } from './domain/types';
import { Store } from './store';

const cfg = (): Config => {
  const c = defaultConfig();
  c.people = [
    { name: 'Ana', role: 'niño', telework: [] },
    { name: 'Mamá', role: 'adulto', telework: [4] },
    { name: 'Papá', role: 'adulto', telework: [2, 5] },
    { name: 'Abuelos', role: 'abuelos', telework: [] },
  ];
  return c;
};

describe('fechas y formato', () => {
  it('días de la semana y fechas', () => {
    expect(weekday('2027-01-01')).toBe(5); // viernes
    expect(parseDate('6/1/2027')).toBe('2027-01-06');
    expect(parseDate('2027-02-30')).toBeNull();
    expect(colLetter(0)).toBe('A');
    expect(colLetter(32)).toBe('AG');
    expect(colLetter(34)).toBe('AI');
    expect(textToTelework('m, V')).toEqual([2, 5]);
  });

  it('la hoja de año se escribe y se vuelve a leer igual', () => {
    const grid: Grid = { Ana: { '2027-02-12': 'VE', '2027-12-31': 'VE' }, Papá: { '2027-02-12': 'V' } };
    const values = buildYear(2027, cfg(), grid);
    expect(values[0].slice(0, 3)).toEqual(['Mes', 'Persona', '1']);
    expect(values.length).toBe(1 + 12 * 4);
    const back = parseYear(values, 2027);
    expect(back.grid).toEqual(grid);
    expect(back.rows.get('2|Papá')).toBe(1 + 4 + 2);
    expect(values[1][37]).toContain('SUMPRODUCT');
  });

  it('la configuración se escribe y se vuelve a leer igual', () => {
    const c = cfg();
    c.quotas = [{ year: 2027, person: 'Papá', code: 'V', available: 25 }];
    expect(parseConfig(serializeConfig(c))).toEqual(c);
  });
});

describe('cobertura y saldos', () => {
  const c = cfg();
  const day = '2027-02-12'; // viernes
  const cov = (grid: Grid) => coverage(c, grid, day).uncovered;

  it('reglas de cobertura', () => {
    expect(cov({})).toBe(false); // hay cole
    expect(cov({ Ana: { [day]: 'VE' } })).toBe(true);
    expect(cov({ Ana: { [day]: 'VE' }, Papá: { [day]: 'T' } })).toBe(true); // teletrabajo no cubre
    expect(cov({ Ana: { [day]: 'VE' }, Papá: { [day]: 'B' } })).toBe(false);
    expect(cov({ Ana: { [day]: 'E' }, Papá: { [day]: 'MB' } })).toBe(true); // una media baja no basta
    expect(cov({ Ana: { [day]: 'E' }, Papá: { [day]: 'MB' }, Mamá: { [day]: 'MB' } })).toBe(false);
    expect(cov({ Ana: { [day]: 'VE' }, Abuelos: { [day]: 'A1' } })).toBe(false);
    expect(cov({ Ana: { [day]: 'CP' } })).toBe(false); // campamento
    expect(coverage(c, { Ana: { '2027-02-13': 'VE' } }, '2027-02-13').uncovered).toBe(false); // sábado
  });

  it('saldos: gastados, planificados y restantes', () => {
    const cq = { ...c, quotas: [{ year: 2027, person: 'Papá', code: 'V', available: 25 }] };
    const grid: Grid = { Papá: { '2027-03-01': 'V', '2027-03-02': 'V', '2027-08-02': 'V', '2027-08-03': 'T' } };
    const v = balances(cq, grid, 2027, cq.people[2], '2027-06-01').find((b) => b.code.code === 'V')!;
    expect(v).toMatchObject({ available: 25, spent: 2, planned: 1, remaining: 22 });
  });

  it('festivos de Madrid 2027', () => {
    const sd = specialDays(c, 2027);
    expect(sd.get('2027-03-19')?.type).toBe('festivo');
    expect(sd.get('2027-03-25')?.type).toBe('festivo'); // dentro del rango no lectivo: gana el festivo
    expect(sd.get('2027-03-24')?.type).toBe('no lectivo');
  });
});

describe('store sobre una hoja simulada', () => {
  async function setup() {
    const be = new MemoryBackend();
    const store = new Store(be);
    await store.init();
    await store.saveConfig(cfg());
    await store.createYear(2027);
    return { be, store };
  }

  it('crea Config y el año con festivos y no lectivos', async () => {
    const { be, store } = await setup();
    expect(await be.listSheets()).toEqual(['Config', '2027']);
    const g = store.grid(2027);
    expect(g['Papá']['2027-01-06']).toBe('F');
    expect(g['Ana']['2027-01-06']).toBe('F');
    expect(g['Ana']['2027-02-12']).toBe('VE');
    expect(g['Ana']['2027-02-13']).toBeUndefined(); // sábado
    expect(g['Abuelos']).toBeUndefined();
    expect(uncoveredDays(store.config, g, 2027)).toContain('2027-02-12');
  });

  it('escribe celdas en la posición correcta y otra sesión las lee', async () => {
    const { be, store } = await setup();
    await store.setRange(store.config.people[2], '2027-02-11', '2027-02-16', 'V');
    const sheet = await be.read('2027');
    const row = 1 + 4 * 1 + 2; // febrero, tercera persona
    expect(sheet[row].slice(0, 2)).toEqual(['Febrero', 'Papá']);
    expect(sheet[row].slice(12, 18)).toEqual(['V', 'V', '', '', 'V', 'V']); // 11..16, salta el finde
    const other = new Store(be);
    await other.init();
    expect(other.grid(2027)).toEqual(store.grid(2027));
    expect(uncoveredDays(other.config, other.grid(2027), 2027)).not.toContain('2027-02-12');
    await store.setRange(store.config.people[2], '2027-02-11', '2027-02-11', '');
    expect((await be.read('2027'))[row][12]).toBe('');
  });

  it('teletrabajo según patrón, sin pisar lo ya puesto ni festivos', async () => {
    const { store } = await setup();
    await store.setRange(store.config.people[2], '2027-01-05', '2027-01-05', 'V'); // martes
    await store.applyTelework(2027, 1);
    const papa = store.grid(2027)['Papá'];
    expect(papa['2027-01-05']).toBe('V');
    expect(papa['2027-01-01']).toBe('F'); // viernes festivo
    expect(papa['2027-01-08']).toBe('T');
    expect(papa['2027-01-12']).toBe('T');
    expect(papa['2027-02-02']).toBeUndefined(); // solo enero
  });

  it('renombrar y añadir personas conserva los datos', async () => {
    const { be, store } = await setup();
    await store.setRange(store.config.people[2], '2027-05-03', '2027-05-04', 'P');
    await store.saveConfigOnly({
      ...store.config, quotas: [{ year: 2027, person: 'Papá', code: 'P', available: 10 }],
    });
    const people = store.config.people.map((p) => (p.name === 'Papá' ? { ...p, name: 'Txe' } : p));
    people.splice(1, 0, { name: 'Bebé', role: 'niño', telework: [] });
    await store.saveConfig({ ...store.config, people }, new Map([['Papá', 'Txe']]));
    const fresh = new Store(be);
    await fresh.init();
    expect(fresh.grid(2027)['Txe']['2027-05-04']).toBe('P');
    expect(fresh.grid(2027)['Papá']).toBeUndefined();
    expect(fresh.config.quotas[0].person).toBe('Txe');
    expect((await be.read('2027')).length).toBe(1 + 12 * 5);
  });

  it('no toca hojas de año con formato antiguo', async () => {
    const be = new MemoryBackend();
    await be.addSheet('2026');
    await be.replace('2026', [['2026'], ['', 'Gon', '1', 'Enero', 'VE']]);
    const store = new Store(be);
    await store.init();
    expect(store.legacy).toEqual(['2026']);
    expect(store.years).toEqual([]);
    await expect(store.createYear(2026)).rejects.toThrow();
    expect((await be.read('2026'))[1][1]).toBe('Gon');
  });
});
