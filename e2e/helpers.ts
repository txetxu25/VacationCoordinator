import { type Page, expect } from '@playwright/test';

/** Fija «hoy» para que las pruebas no dependan de la fecha real. */
export async function freezeToday(page: Page, iso = '2026-11-18') {
  await page.addInitScript((t) => {
    const T = new Date(`${t}T10:00:00`).getTime();
    const D = Date;
    class FakeDate extends D {
      constructor(...a: unknown[]) {
        // @ts-expect-error argumentos variables de Date
        super(...(a.length ? a : [T]));
      }
      static now() {
        return T;
      }
    }
    // @ts-expect-error se sustituye Date en la página
    window.Date = FakeDate;
  }, iso);
}

/** Abre la app en modo demo con la hoja del año en curso creada y nombres de ejemplo. */
export async function openDemo(page: Page) {
  await freezeToday(page);
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByText('Probar en modo demo').click();
  await page.getByRole('button', { name: /Crear hoja 2026/ }).click();
  await tab(page, 'Ajustes').click();
  const names = page.getByLabel('Nombre');
  for (const [i, n] of ['Ana', 'Leo', 'Mamá', 'Papá'].entries()) await names.nth(i).fill(n);
  await page.getByRole('button', { name: 'Guardar ajustes' }).click();
  await expect(page.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled();
}

export const tab = (page: Page, name: string) => page.locator('nav').getByRole('button', { name, exact: true });

/** Celdas guardadas en la hoja de cálculo simulada del modo demo. */
export async function sheetCells(page: Page, sheet: string, person: string): Promise<string[]> {
  return page.evaluate(
    ([s, p]) => {
      const sheets = new Map<string, string[][]>(JSON.parse(localStorage.getItem('vc-demo') ?? '[]'));
      return (sheets.get(s) ?? []).filter((r) => r[1] === p).flatMap((r) => r.slice(2, 33));
    },
    [sheet, person],
  );
}

/** Anota un código en un periodo desde el calendario (mes de noviembre 2026). */
export async function apply(page: Page, person: string, day: number, label: string, until?: string) {
  await page.getByLabel(new RegExp(`^${person}, . ${day} nov`)).click();
  await page.locator('.codes button', { hasText: label }).first().click();
  if (until) await page.locator('.period input').nth(1).fill(until);
  await page.locator('.sheet .primary').click();
  await expect(page.locator('.sheet')).toHaveCount(0);
}
