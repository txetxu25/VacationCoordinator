import type { Backend } from './backend/types';
import { defaultConfig } from './domain/defaults';
import { parts } from './domain/dates';
import { type Legacy, parseLegacy } from './domain/legacy';
import { madridDays } from './domain/defaults';
import { type Plan, leaveWrites } from './domain/leave';
import { holidayChecker, rangeWrites, specialDayWrites, teleworkWrites } from './domain/logic';
import {
  SUMMARY_COL, type YearData, buildYear, isAppYearSheet, parseConfig, parseLeaves, parseYear, serializeConfig,
  serializeLeaves,
} from './domain/sheet';
import type { CellWrite, Config, Grid, LeaveBlock, LeaveType, Person } from './domain/types';

const CONFIG_SHEET = 'Config';
const LEAVE_SHEET = 'Permisos';
const ORIGINAL = /^(\d{4}) original$/;
const isYearTitle = (t: string) => /^\d{4}$/.test(t);

/** Estado de la app; toda la información vive en la hoja de cálculo. */
export class Store {
  config: Config = defaultConfig();
  /** Años con el formato de la app */
  years: number[] = [];
  /** Hojas de año con formato antiguo (histórico, no se tocan) */
  legacy: string[] = [];
  /** Hojas "<año> original" que quedaron tras importar: se puede volver a importar de ellas */
  originals: string[] = [];
  private hasLeaveSheet = false;
  private data = new Map<number, YearData>();
  /** Aviso no bloqueante (p. ej. si falla el formato de colores) */
  warning = '';

  constructor(private be: Backend) {}

  async init() {
    const sheets = await this.be.listSheets();
    this.hasLeaveSheet = sheets.includes(LEAVE_SHEET);
    this.originals = sheets.filter((t) => ORIGINAL.test(t));
    if (sheets.includes(CONFIG_SHEET)) {
      await this.readConfig();
    } else {
      this.config = defaultConfig();
      await this.be.addSheet(CONFIG_SHEET, 200, 26);
      await this.be.replace(CONFIG_SHEET, serializeConfig(this.config));
    }
    this.years = [];
    this.legacy = [];
    this.data.clear();
    for (const title of sheets.filter(isYearTitle)) {
      const values = await this.be.read(title);
      if (isAppYearSheet(values)) {
        this.years.push(+title);
        this.data.set(+title, parseYear(values, +title));
      } else this.legacy.push(title);
    }
    this.years.sort();
    await this.healHolidays();
  }

  /** Festivos que falten (hojas de versiones anteriores, personas nuevas…): se completan solos. */
  private async healHolidays() {
    for (const year of this.years) {
      const missing = specialDayWrites(this.config, this.grid(year), year, 'festivo');
      if (missing.length) await this.setCells(missing);
    }
  }

  private async readConfig() {
    this.config = parseConfig(await this.be.read(CONFIG_SHEET));
    if (this.hasLeaveSheet) Object.assign(this.config, parseLeaves(await this.be.read(LEAVE_SHEET)));
  }

  private get plan(): Plan {
    return { types: this.config.leaveTypes, blocks: this.config.leaves };
  }

  private get adults() {
    return this.config.people.filter((p) => p.role === 'adulto').map((p) => p.name);
  }

  grid(year: number): Grid {
    return this.data.get(year)?.grid ?? {};
  }

  /** Vuelve a leer configuración y año (por si la otra persona ha cambiado algo). */
  async refresh(year: number) {
    await this.readConfig();
    if (this.years.includes(year)) await this.loadYear(year);
  }

  private async loadYear(year: number) {
    this.data.set(year, parseYear(await this.be.read(String(year)), year));
  }

  async createYear(year: number) {
    const title = String(year);
    if ((await this.be.listSheets()).includes(title))
      throw new Error(`Ya existe una hoja "${title}" con otro formato; la app no la modifica.`);
    await this.be.addSheet(title, 12 * this.config.people.length + 60, SUMMARY_COL + 6);
    const grid: Grid = {};
    for (const w of specialDayWrites(this.config, grid, year)) (grid[w.person] ??= {})[w.date] = w.code;
    const none: Plan = { types: [], blocks: [] };
    for (const w of leaveWrites(this.adults, none, this.plan, () => grid, holidayChecker(this.config))) {
      if (w.date.startsWith(title)) (grid[w.person] ??= {})[w.date] = w.code;
    }
    await this.writeYear(year, grid);
    this.years = [...this.years, year].sort();
  }

  /** Lee una hoja con formato antiguo, sin modificarla. */
  async readLegacy(source: string): Promise<Legacy> {
    return parseLegacy(await this.be.read(source), parseInt(source, 10));
  }

  /**
   * Pasa un año con formato antiguo al formato de la app.
   * `mapping`: nombre antiguo -> persona de la app ('' = no importar).
   * - Si `source` es la hoja del año ("2026"), no se pierde: se renombra a "2026 original" y se
   *   crea una nueva con los mismos datos.
   * - Si `source` es "2026 original" y el año ya está en la app, se completan las celdas vacías
   *   (sirve para traer filas que se quedaron sin asignar la primera vez).
   */
  async importLegacy(source: string, mapping: Record<string, string>) {
    const year = parseInt(source, 10);
    const legacy = await this.readLegacy(source);
    const merging = this.years.includes(year);
    if (merging) await this.loadYear(year);
    const grid: Grid = {};
    for (const [person, cells] of Object.entries(this.grid(year))) grid[person] = { ...cells };
    for (const [old, cells] of Object.entries(legacy.grid)) {
      const target = mapping[old];
      if (!target || !this.config.people.some((p) => p.name === target)) continue;
      // lo ya anotado en la app manda sobre la hoja antigua
      grid[target] = { ...cells, ...grid[target] };
    }
    this.fillHolidays(grid, year);
    if (!merging) {
      await this.be.renameSheet(source, `${source} original`);
      await this.be.addSheet(source, 12 * this.config.people.length + 60, SUMMARY_COL + 6);
      this.legacy = this.legacy.filter((t) => t !== source);
      this.originals = [...this.originals, `${source} original`];
      this.years = [...this.years, year].sort();
    }
    await this.writeYear(year, grid);
  }

  /** Pone F en los laborables festivos que estén vacíos, para todas las personas. */
  private fillHolidays(grid: Grid, year: number) {
    for (const w of specialDayWrites(this.config, grid, year, 'festivo')) (grid[w.person] ??= {})[w.date] = w.code;
  }

  private async writeYear(year: number, grid: Grid) {
    const values = buildYear(year, this.config, grid);
    await this.be.replace(String(year), values);
    this.data.set(year, parseYear(values, year));
    try {
      await this.be.formatYear?.(String(year), {
        year, peopleCount: this.config.people.length, codes: this.config.codes,
      });
    } catch (e) {
      this.warning = `Datos guardados, pero no se han podido aplicar los colores en la hoja ${year}: ${(e as Error).message}`;
    }
  }

  async setCells(writes: CellWrite[]) {
    const byYear = new Map<number, CellWrite[]>();
    for (const w of writes) {
      const y = parts(w.date).y;
      if (!this.years.includes(y)) continue;
      byYear.set(y, [...(byYear.get(y) ?? []), w]);
    }
    for (const [year, list] of byYear) {
      const yd = this.data.get(year)!;
      const cells = list.map((w) => {
        const { m, d } = parts(w.date);
        const row = yd.rows.get(`${m}|${w.person}`);
        if (row == null) throw new Error(`"${w.person}" no está en la hoja ${year}. Guarda los ajustes para regenerarla.`);
        if (w.code) (yd.grid[w.person] ??= {})[w.date] = w.code;
        else delete yd.grid[w.person]?.[w.date];
        return { row, col: 1 + d, value: w.code };
      });
      await this.be.writeCells(String(year), cells);
    }
  }

  setRange(person: Person, from: string, to: string, code: string) {
    return this.setCells(rangeWrites(this.config, person, from, to, code));
  }

  applyTelework(year: number, month = 0) {
    return this.setCells(teleworkWrites(this.config, this.grid(year), year, month));
  }

  applySpecialDays(year: number) {
    return this.setCells(specialDayWrites(this.config, this.grid(year), year));
  }

  /** Guarda los permisos y su planificación, y los refleja en las hojas de año. */
  async saveLeaves(leaveTypes: LeaveType[], leaves: LeaveBlock[], birth: string) {
    const after: Plan = { types: leaveTypes, blocks: leaves };
    const writes = leaveWrites(this.adults, this.plan, after, (y) => this.grid(y), holidayChecker(this.config));
    await this.saveConfigOnly({ ...this.config, leaveTypes, leaves, birth });
    await this.writeLeaveSheet();
    await this.setCells(writes);
    await this.healHolidays(); // un festivo que queda libre al mover un permiso vuelve a ser F
  }

  private async writeLeaveSheet() {
    if (!this.hasLeaveSheet) {
      if (!this.config.leaveTypes.length && !this.config.leaves.length) return;
      await this.be.addSheet(LEAVE_SHEET, 200, 20);
      this.hasLeaveSheet = true;
    }
    await this.be.replace(LEAVE_SHEET, serializeLeaves(this.config));
  }

  /** Festivos y no lectivos precargados de Madrid para un año que aún no estén en la tabla. */
  missingMadridDays(year: number, current = this.config.days) {
    return madridDays(year).filter((d) => !current.some((c) => c.from === d.from && c.type === d.type));
  }

  /** Guarda solo cuotas / días: no cambia la estructura de las hojas de año. */
  async saveConfigOnly(config: Config) {
    this.config = config;
    await this.be.replace(CONFIG_SHEET, serializeConfig(config));
  }

  /**
   * Guarda personas y códigos y regenera las hojas de año con la nueva estructura.
   * `renames` (nombre antiguo -> nuevo) conserva los datos de quien cambia de nombre;
   * quien desaparece de la lista pierde su fila.
   */
  async saveConfig(config: Config, renames = new Map<string, string>()) {
    const names = new Set(config.people.map((p) => p.name));
    if (names.size !== config.people.length) throw new Error('Hay dos personas con el mismo nombre.');
    if (config.people.some((p) => !p.name.trim())) throw new Error('Hay una persona sin nombre.');
    const rn = (n: string) => renames.get(n) ?? n;
    config = {
      ...config,
      quotas: config.quotas.map((q) => ({ ...q, person: rn(q.person) })).filter((q) => names.has(q.person)),
      leaveTypes: config.leaveTypes.map((t) => ({ ...t, person: rn(t.person) })).filter((t) => names.has(t.person)),
      leaves: config.leaves.map((l) => ({ ...l, person: rn(l.person) })).filter((l) => names.has(l.person)),
    };
    await this.saveConfigOnly(config);
    await this.writeLeaveSheet();
    for (const year of this.years) {
      await this.loadYear(year); // por si hay cambios de la otra persona
      const grid: Grid = {};
      for (const [person, cells] of Object.entries(this.grid(year))) {
        if (names.has(rn(person))) grid[rn(person)] = cells;
      }
      this.fillHolidays(grid, year); // también para personas recién añadidas y festivos nuevos
      await this.writeYear(year, grid);
    }
  }
}
