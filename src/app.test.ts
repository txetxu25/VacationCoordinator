import { describe, expect, it } from 'vitest';
import { MemoryBackend } from './backend/memory';
import { defaultConfig } from './domain/defaults';
import { parseDate, weekday } from './domain/dates';
import { guessMapping, parseLegacy } from './domain/legacy';
import { analyzeLeave, blockEnd, timeline } from './domain/leave';
import { balances, coverage, specialDays, uncoveredDays } from './domain/logic';
import { buildYear, colLetter, parseConfig, parseYear, serializeConfig, textToTelework } from './domain/sheet';
import type { Config, Grid } from './domain/types';
import { Store } from './store';

const cfg = (): Config => {
  const c = defaultConfig();
  c.people = [
    { name: 'Ana', role: 'niño', telework: [], carryMonth: 0 },
    { name: 'Mamá', role: 'adulto', telework: [4], carryMonth: 1 },
    { name: 'Papá', role: 'adulto', telework: [2, 5], carryMonth: 3 },
    { name: 'Abuelos', role: 'abuelos', telework: [], carryMonth: 0 },
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

  it('vacaciones arrastradas: cálculo automático y caducidad', () => {
    const cq = { ...c, quotas: [{ year: 2026, person: 'Papá', code: 'V', available: 25 }] };
    const prev: Grid = { Papá: Object.fromEntries(['01', '02', '03', '04'].map((d) => [`2026-07-${d}`, 'V'])) };
    const grid: Grid = { Papá: { '2027-02-01': 'VP', '2027-03-31': 'VP', '2027-04-01': 'VP' } };
    const vp = balances(cq, grid, 2027, cq.people[2], '2027-01-10', prev).find((b) => b.code.code === 'VP')!;
    expect(vp).toMatchObject({ available: 21, auto: true, planned: 3, remaining: 18, expiry: '2027-03-31', late: 1 });
    // la otra persona caduca en enero; una cuota tecleada manda sobre el cálculo
    const manual = { ...cq, quotas: [...cq.quotas, { year: 2027, person: 'Papá', code: 'VP', available: 5 }] };
    expect(balances(manual, grid, 2027, cq.people[2], '2027-01-10', prev).find((b) => b.code.code === 'VP'))
      .toMatchObject({ available: 5, auto: false });
    expect(balances(cq, {}, 2027, cq.people[1], '2027-01-10', {}).find((b) => b.code.code === 'VP'))
      .toMatchObject({ available: null, expiry: '2027-01-31' });
  });

  it('permiso por nacimiento en semanas naturales', () => {
    const rules = { birth: '2027-02-10', total: 19, mandatory: 6, months: 12, extra: 2 }; // miércoles
    const ok = [
      { person: 'Papá', start: '2027-02-10', weeks: 6, note: '' },
      { person: 'Papá', start: '2027-06-07', weeks: 11, note: '' },
    ];
    expect(analyzeLeave(rules, ok, 'Papá')).toEqual({ used: 17, remaining: 2, warnings: [] });
    // un bloque que empieza en jueves termina el miércoles siguiente
    expect(blockEnd({ person: 'Papá', start: '2027-06-10', weeks: 1, note: '' })).toBe('2027-06-16');
    const bad = [
      { person: 'Papá', start: '2027-02-10', weeks: 4, note: '' }, // faltan obligatorias
      { person: 'Papá', start: '2027-03-01', weeks: 2, note: '' }, // se solapa con el anterior
      { person: 'Papá', start: '2028-03-06', weeks: 14, note: '' }, // demasiadas después de 12 meses y del total
    ];
    const a = analyzeLeave(rules, bad, 'Papá');
    expect(a.used).toBe(20);
    expect(a.warnings).toHaveLength(4);
    const t = timeline(rules, [...ok, { person: 'Mamá', start: '2027-02-10', weeks: 16, note: '' }], ['Mamá', 'Papá']);
    expect(t[0]).toEqual({ start: '2027-02-10', on: [true, true] });
    expect(t[6].on).toEqual([true, false]);
    expect(t[16].on).toEqual([false, false]);
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
    expect(g['Abuelos']['2027-01-06']).toBe('F'); // festivos para todos
    expect(g['Abuelos']['2027-02-12']).toBeUndefined();
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
    const people = store.config.people.map((p) => (p.name === 'Papá' ? { ...p, name: 'Pau' } : p));
    people.splice(1, 0, { name: 'Bebé', role: 'niño', telework: [], carryMonth: 0 });
    await store.saveConfig({ ...store.config, people }, new Map([['Papá', 'Pau']]));
    const fresh = new Store(be);
    await fresh.init();
    expect(fresh.grid(2027)['Pau']['2027-05-04']).toBe('P');
    expect(fresh.grid(2027)['Papá']).toBeUndefined();
    expect(fresh.config.quotas[0].person).toBe('Pau');
    expect((await be.read('2027')).length).toBe(1 + 12 * 5);
  });

  it('importa un año con formato antiguo conservando el original', async () => {
    const be = new MemoryBackend();
    await be.addSheet('2026');
    const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
    const row = (p: string, m: string, name: string, cells: Record<number, string>) => [
      '', p, m, name, ...days.map((d) => cells[+d] ?? ''), '', 'Fam', 'Vacaciones', 'V', '13',
    ];
    const original = [
      ['2026'],
      ['', '', '', '', ...days, '', 'Fam', 'Descripción', 'Código', 'Recuento'],
      row('Leo', '1', 'Enero', { 1: 'VE', 2: 'VE' }),
      row('Pau', '1', '', { 1: 'F', 2: 'VP' }),
      row('Abu', '1', '', {}),
      row('Pau', '11', 'Noviembre', { 3: 'T', 30: 'V' }),
      row('Otro', '12', 'Diciembre', { 8: 'F' }),
    ];
    await be.replace('2026', original);
    expect(parseLegacy(original, 2026).people).toEqual(['Leo', 'Pau', 'Abu', 'Otro']);
    // formato 2025: mes abreviado en cada fila y sin columna de número
    const old = parseLegacy([['', '', '', ...days], ['', 'Leo', 'Feb', 'FD', '', 'VE']], 2025);
    expect(old.grid).toEqual({ Leo: { '2025-02-01': 'FD', '2025-02-03': 'VE' } });

    const store = new Store(be);
    await store.init();
    const people = [
      { name: 'Leonor', role: 'niño' as const, telework: [], carryMonth: 0 },
      { name: 'Pau', role: 'adulto' as const, telework: [], carryMonth: 0 },
      { name: 'Abuelos', role: 'abuelos' as const, telework: [], carryMonth: 0 },
    ];
    await store.saveConfig({ ...store.config, people });
    const mapping = guessMapping(['Leo', 'Pau', 'Abu', 'Otro'], people.map((p) => p.name));
    expect(mapping).toEqual({ Leo: 'Leonor', Pau: 'Pau', Abu: 'Abuelos', Otro: '' });
    await store.importLegacy('2026', mapping);

    expect(await be.listSheets()).toEqual(['2026 original', 'Config', '2026']);
    expect(await be.read('2026 original')).toEqual(original);
    expect(store.years).toEqual([2026]);
    expect(store.legacy).toEqual([]);
    expect(store.grid(2026)).toEqual({
      Leonor: { '2026-01-01': 'VE', '2026-01-02': 'VE' },
      Pau: { '2026-01-01': 'F', '2026-01-02': 'VP', '2026-11-03': 'T', '2026-11-30': 'V' },
    });
    await store.setRange(people[1], '2026-11-16', '2026-11-16', 'V');
    const fresh = new Store(be);
    await fresh.init();
    expect(fresh.grid(2026)['Pau']['2026-11-16']).toBe('V');
  });

  it('el plan de permiso escribe PN en laborables y lo retira al cambiarlo', async () => {
    const { be, store } = await setup();
    const rules = { ...store.config.rules, birth: '2027-02-10' };
    await store.saveLeaves([{ person: 'Papá', start: '2027-02-10', weeks: 6, note: '' }], rules);
    const papa = () => store.grid(2027)['Papá'];
    expect(papa()['2027-02-10']).toBe('PN');
    expect(papa()['2027-02-13']).toBeUndefined(); // sábado
    expect(papa()['2027-03-19']).toBe('PN'); // festivo dentro del permiso
    expect(papa()['2027-03-23']).toBe('PN'); // último día (martes)
    expect(papa()['2027-03-24']).toBeUndefined();
    expect(Object.values(papa()).filter((c) => c === 'PN')).toHaveLength(30);
    await store.saveLeaves([{ person: 'Papá', start: '2027-02-10', weeks: 2, note: '' }], rules);
    expect(Object.values(papa()).filter((c) => c === 'PN')).toHaveLength(10);
    const fresh = new Store(be);
    await fresh.init();
    expect(fresh.config.leaves).toEqual(store.config.leaves);
    expect(fresh.config.rules.birth).toBe('2027-02-10');
    expect(fresh.grid(2027)).toEqual(store.grid(2027));
  });

  it('lee una hoja Config creada por la versión anterior', async () => {
    const be = new MemoryBackend();
    await be.addSheet('Config');
    await be.replace('Config', [
      ['Persona', 'Rol', 'Teletrabajo', '', 'Código', 'Descripción', 'Rol', 'Cobertura', 'Color'],
      ['Ana', 'niño', '', '', 'V', 'Vacaciones', 'adulto', '1', '#8fd19e'],
      ['Papá', 'adulto', 'M,V', '', 'VE', 'Sin cole', 'niño', '1', '#fff3a0'],
    ]);
    const store = new Store(be);
    await store.init();
    expect(store.config.people[1]).toEqual({ name: 'Papá', role: 'adulto', telework: [2, 5], carryMonth: 0 });
    expect(store.config.leaves).toEqual([]);
    expect(store.config.rules.total).toBe(19);
  });

  it('no toca hojas de año con formato antiguo', async () => {
    const be = new MemoryBackend();
    await be.addSheet('2026');
    await be.replace('2026', [['2026'], ['', 'Leo', '1', 'Enero', 'VE']]);
    const store = new Store(be);
    await store.init();
    expect(store.legacy).toEqual(['2026']);
    expect(store.years).toEqual([]);
    await expect(store.createYear(2026)).rejects.toThrow();
    expect((await be.read('2026'))[1][1]).toBe('Leo');
  });
});
