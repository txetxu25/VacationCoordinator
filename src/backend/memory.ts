import type { Backend, Cell } from './types';

/** Hoja de cálculo simulada (modo demo y tests). Si se le da una clave, persiste en localStorage. */
export class MemoryBackend implements Backend {
  sheets = new Map<string, string[][]>();

  constructor(private storageKey?: string) {
    if (storageKey && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(storageKey);
      if (raw) this.sheets = new Map(JSON.parse(raw));
    }
  }

  private save() {
    if (this.storageKey && typeof localStorage !== 'undefined')
      localStorage.setItem(this.storageKey, JSON.stringify([...this.sheets]));
  }

  async listSheets() {
    return [...this.sheets.keys()];
  }

  async addSheet(title: string) {
    if (this.sheets.has(title)) throw new Error(`Ya existe la hoja "${title}"`);
    this.sheets.set(title, []);
    this.save();
  }

  async renameSheet(from: string, to: string) {
    if (this.sheets.has(to)) throw new Error(`Ya existe la hoja "${to}"`);
    // Conserva el orden de las hojas
    this.sheets = new Map([...this.sheets].map(([k, v]) => [k === from ? to : k, v]));
    this.save();
  }

  async read(sheet: string) {
    return (this.sheets.get(sheet) ?? []).map((r) => [...r]);
  }

  async replace(sheet: string, values: string[][]) {
    this.sheets.set(sheet, values.map((r) => [...r]));
    this.save();
  }

  async writeCells(sheet: string, cells: Cell[]) {
    const data = this.sheets.get(sheet);
    if (!data) throw new Error(`No existe la hoja "${sheet}"`);
    for (const c of cells) {
      while (data.length <= c.row) data.push([]);
      const row = data[c.row];
      while (row.length <= c.col) row.push('');
      row[c.col] = c.value;
    }
    this.save();
  }
}
