import { daysInMonth, isWeekend, iso } from '../domain/dates';
import { GRID_COLS, colLetter } from '../domain/sheet';
import type { Backend, Cell, YearFormat } from './types';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export class AuthError extends Error {}

const rgb = (hex: string) => ({
  red: parseInt(hex.slice(1, 3), 16) / 255,
  green: parseInt(hex.slice(3, 5), 16) / 255,
  blue: parseInt(hex.slice(5, 7), 16) / 255,
});

const a1 = (sheet: string, cell = '') => `'${sheet.replace(/'/g, "''")}'${cell ? '!' + cell : ''}`;

/** Google Sheets vía API REST v4, con el token del usuario. */
export class GoogleBackend implements Backend {
  private ids = new Map<string, number>();

  constructor(private spreadsheetId: string, private token: () => string | null) {}

  private async call<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const token = this.token();
    if (!token) throw new AuthError('La sesión de Google ha caducado.');
    const res = await fetch(`${API}/${this.spreadsheetId}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) throw new AuthError('La sesión de Google ha caducado.');
    if (!res.ok) {
      const detail = await res.json().then((j) => j?.error?.message, () => '');
      if (res.status === 403) throw new Error(`Sin permiso sobre la hoja de cálculo. ${detail}`);
      if (res.status === 404) throw new Error('No se encuentra la hoja de cálculo: revisa el enlace en Ajustes.');
      throw new Error(`Error de Google Sheets (${res.status}). ${detail}`);
    }
    return res.json();
  }

  private batch(requests: unknown[]) {
    return this.call(':batchUpdate', 'POST', { requests });
  }

  async listSheets() {
    const meta = await this.call<{ sheets: { properties: { sheetId: number; title: string } }[] }>(
      '?fields=sheets.properties(sheetId,title)',
    );
    this.ids = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
    return [...this.ids.keys()];
  }

  async addSheet(title: string, rows: number, cols: number) {
    await this.batch([{ addSheet: { properties: { title, gridProperties: { rowCount: rows, columnCount: cols } } } }]);
    await this.listSheets();
  }

  async renameSheet(from: string, to: string) {
    if (!this.ids.has(from)) await this.listSheets();
    const sheetId = this.ids.get(from);
    if (sheetId == null) throw new Error(`No existe la hoja "${from}"`);
    await this.batch([{ updateSheetProperties: { properties: { sheetId, title: to }, fields: 'title' } }]);
    await this.listSheets();
  }

  async read(sheet: string) {
    const res = await this.call<{ values?: unknown[][] }>(`/values/${encodeURIComponent(a1(sheet))}`);
    return (res.values ?? []).map((r) => r.map((v) => String(v ?? '')));
  }

  async replace(sheet: string, values: string[][]) {
    await this.call(`/values/${encodeURIComponent(a1(sheet))}:clear`, 'POST', {});
    await this.call(`/values/${encodeURIComponent(a1(sheet, 'A1'))}?valueInputOption=USER_ENTERED`, 'PUT', { values });
  }

  async writeCells(sheet: string, cells: Cell[]) {
    if (!cells.length) return;
    await this.call('/values:batchUpdate', 'POST', {
      valueInputOption: 'USER_ENTERED',
      data: cells.map((c) => ({ range: a1(sheet, colLetter(c.col) + (c.row + 1)), values: [[c.value]] })),
    });
  }

  async formatYear(sheet: string, { year, peopleCount: n, codes }: YearFormat) {
    if (!this.ids.has(sheet)) await this.listSheets();
    const sheetId = this.ids.get(sheet);
    if (sheetId == null) return;
    const meta = await this.call<{ sheets: { properties: { sheetId: number }; conditionalFormats?: unknown[] }[] }>(
      '?fields=sheets(properties.sheetId,conditionalFormats)',
    );
    const existing = meta.sheets.find((s) => s.properties.sheetId === sheetId)?.conditionalFormats?.length ?? 0;
    const lastRow = 1 + 12 * n;
    const grid = { sheetId, startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 2, endColumnIndex: GRID_COLS };
    const fill = (range: object, hex: string) => ({
      repeatCell: {
        range,
        cell: { userEnteredFormat: { backgroundColor: rgb(hex) } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    });
    const requests: unknown[] = [
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 2 } },
          fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
        },
      },
      ...Array.from({ length: existing }, () => ({ deleteConditionalFormatRule: { sheetId, index: 0 } })),
      fill(grid, '#ffffff'),
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      },
      {
        repeatCell: {
          range: grid,
          cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
          fields: 'userEnteredFormat.horizontalAlignment',
        },
      },
    ];
    // Fines de semana en gris claro; días que no existen (30 feb…) en gris oscuro.
    for (let m = 1; m <= 12; m++) {
      const max = daysInMonth(year, m);
      for (let d = 1; d <= 31; d++) {
        const hex = d > max ? '#bdbdbd' : isWeekend(iso(year, m, d)) ? '#eeeeee' : '';
        if (!hex) continue;
        requests.push(
          fill(
            {
              sheetId,
              startRowIndex: 1 + (m - 1) * n,
              endRowIndex: 1 + m * n,
              startColumnIndex: 1 + d,
              endColumnIndex: 2 + d,
            },
            hex,
          ),
        );
      }
    }
    const seen = new Set<string>();
    for (const c of codes) {
      if (seen.has(c.code)) continue;
      seen.add(c.code);
      requests.push({
        addConditionalFormatRule: {
          index: 0,
          rule: {
            ranges: [grid],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: c.code }] },
              format: { backgroundColor: rgb(c.color) },
            },
          },
        },
      });
    }
    await this.batch(requests);
  }
}
