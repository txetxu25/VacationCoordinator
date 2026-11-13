import type { Code } from '../domain/types';

export interface Cell {
  row: number; // 0 = primera fila
  col: number; // 0 = columna A
  value: string;
}

export interface YearFormat {
  year: number;
  peopleCount: number;
  codes: Code[];
}

/** Lo mínimo que la app necesita de una hoja de cálculo. */
export interface Backend {
  listSheets(): Promise<string[]>;
  addSheet(title: string, rows: number, cols: number): Promise<void>;
  /** Todos los valores de la hoja, como texto. */
  read(sheet: string): Promise<string[][]>;
  /** Vacía la hoja y escribe desde A1. Los valores que empiezan por "=" son fórmulas. */
  replace(sheet: string, values: string[][]): Promise<void>;
  writeCells(sheet: string, cells: Cell[]): Promise<void>;
  /** Colores y paneles fijos de una hoja de año (opcional). */
  formatYear?(sheet: string, format: YearFormat): Promise<void>;
}
