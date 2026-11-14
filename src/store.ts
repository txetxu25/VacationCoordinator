import type { Backend } from './backend/types';
import { defaultConfig } from './domain/defaults';
import { parts } from './domain/dates';
import { type Legacy, parseLegacy } from './domain/legacy';
import { leaveWrites } from './domain/leave';
import { rangeWrites, specialDayWrites, teleworkWrites } from './domain/logic';
import {
  SUMMARY_COL, type YearData, buildYear, isAppYearSheet, parseConfig, parseYear, serializeConfig,
} from './domain/sheet';
import type { BirthRules, CellWrite, Config, Grid, LeaveBlock, Person } from './domain/types';

const CONFIG_SHEET = 'Config';
const isYearTitle = (t: string) => /^\d{4}$/.test(t);

/** Estado de la app; toda la información vive en la hoja de cálculo. */
export class Store {
  config: Config = defaultConfig();
  /** Años con el formato de la app */
  years: number[] = [];
  /** Hojas de año con formato antiguo (histórico, no se tocan) */
  legacy: string[] = [];
  private data = new Map<number, YearData>();
  /** Aviso no bloqueante (p. ej. si falla el formato de colores) */
  warning = '';

  constructor(private be: Backend) {}

  async init() {
    const sheets = await this.be.listSheets();
    if (sheets.includes(CONFIG_SHEET)) {
      this.config = parseConfig(await this.be.read(CONFIG_SHEET));
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
  }

  grid(year: number): Grid {
    return this.data.get(year)?.grid ?? {};
  }

  /** Vuelve a leer configuración y año (por si la otra persona ha cambiado algo). */
  async refresh(year: number) {
    this.config = parseConfig(await this.be.read(CONFIG_SHEET));
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
    const adults = this.config.people.filter((p) => p.role === 'adulto').map((p) => p.name);
    for (const w of leaveWrites(adults, [], this.config.leaves, () => grid)) {
      if (w.date.startsWith(title)) (grid[w.person] ??= {})[w.date] = w.code;
    }
    await this.writeYear(year, grid);
    this.years = [...this.years, year].sort();
  }

  /** Lee una hoja con formato antiguo, sin modificarla. */
  async readLegacy(title: string): Promise<Legacy> {
    return parseLegacy(await this.be.read(title), +title);
  }

  /**
   * Pasa un año con formato antiguo al formato de la app. La hoja original no se pierde:
   * se renombra a "<año> original" y se crea una nueva con los mismos datos.
   * `mapping`: nombre antiguo -> persona de la app ('' = no importar).
   */
  async importLegacy(title: string, mapping: Record<string, string>) {
    const year = +title;
    const legacy = await this.readLegacy(title);
    const grid: Grid = {};
    for (const [old, cells] of Object.entries(legacy.grid)) {
      const target = mapping[old];
      if (target && this.config.people.some((p) => p.name === target)) grid[target] = { ...grid[target], ...cells };
    }
    await this.be.renameSheet(title, `${title} original`);
    await this.be.addSheet(title, 12 * this.config.people.length + 60, SUMMARY_COL + 6);
    await this.writeYear(year, grid);
    this.legacy = this.legacy.filter((t) => t !== title);
    this.years = [...this.years, year].sort();
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

  /** Guarda el plan de permiso por nacimiento y lo refleja en las hojas de año (código PN). */
  async saveLeaves(leaves: LeaveBlock[], rules: BirthRules) {
    const adults = this.config.people.filter((p) => p.role === 'adulto').map((p) => p.name);
    const writes = leaveWrites(adults, this.config.leaves, leaves, (y) => this.grid(y));
    await this.saveConfigOnly({ ...this.config, leaves, rules });
    await this.setCells(writes);
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
      leaves: config.leaves.map((l) => ({ ...l, person: rn(l.person) })).filter((l) => names.has(l.person)),
    };
    await this.saveConfigOnly(config);
    for (const year of this.years) {
      await this.loadYear(year); // por si hay cambios de la otra persona
      const grid: Grid = {};
      for (const [person, cells] of Object.entries(this.grid(year))) {
        if (names.has(rn(person))) grid[rn(person)] = cells;
      }
      await this.writeYear(year, grid);
    }
  }
}
