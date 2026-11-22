import { expect, test } from '@playwright/test';
import { apply, openDemo, sheetCells, tab } from './helpers';

test.beforeEach(async ({ page }) => {
  await openDemo(page);
  await tab(page, 'Calendario').click();
  await expect(page.locator('table.cal')).toBeVisible();
});

test('anotar un periodo salta fines de semana y se puede deshacer', async ({ page }) => {
  await apply(page, 'Papá', 16, 'Vacaciones', '2026-11-23');
  const count = async () => (await sheetCells(page, '2026', 'Papá')).filter((c) => c === 'V').length;
  expect(await count()).toBe(6); // 16-20 y 23
  await page.locator('.toast').getByRole('button', { name: 'Deshacer' }).click();
  await expect.poll(count).toBe(0);
});

test('respetar lo ya anotado al aplicar un periodo', async ({ page }) => {
  await apply(page, 'Mamá', 17, 'Teletrabajo');
  await page.getByLabel(/^Mamá, . 16 nov/).click();
  await page.locator('.codes button', { hasText: 'Vacaciones' }).first().click();
  await page.locator('.period input').nth(1).fill('2026-11-18');
  await page.getByLabel('Sustituir lo que ya esté anotado').uncheck();
  await expect(page.locator('.summary')).toContainText('se respetará');
  await page.locator('.sheet .primary').click();
  const cells = await sheetCells(page, '2026', 'Mamá');
  expect([cells[11 * 31 - 31 + 15], cells[11 * 31 - 31 + 16], cells[11 * 31 - 31 + 17]]).toEqual(['V', 'T', 'V']);
});

test('días sin cubrir: aviso y desaparece al cubrirlos', async ({ page }) => {
  await apply(page, 'Ana', 19, 'Enfermo');
  await expect(page.locator('.banner').first()).toContainText('1 día sin cubrir');
  await apply(page, 'Mamá', 19, 'Cuidado de menor');
  await expect(page.locator('.banner').first()).toContainText('Todo cubierto');
});

test('cuadro de próximos días encima del mes: bebé en casa sin cubrir', async ({ page }) => {
  await apply(page, 'Leo', 19, 'En casa (sin guardería)', '2026-11-20');
  const row = page.locator('.daylist .dayrow', { hasText: '19 nov' });
  await expect(row).toContainText('Leo');
  await expect(row).toContainText('Sin cubrir');
  await apply(page, 'Mamá', 19, 'Cuidado de menor');
  await expect(row).toContainText('Cubierto');
  // el cuadro va encima de la tabla del mes
  const box = (await page.locator('.daylist').boundingBox())!;
  const table = (await page.locator('table.cal').boundingBox())!;
  expect(box.y).toBeLessThan(table.y);
});

test('deslizar cambia de pestaña y la hoja se cierra arrastrando la barrita', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (x0: number, x1: number, y = 500) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 8, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await swipe(330, 60);
  await expect(page.locator('nav .active')).toHaveText('Año');
  await swipe(60, 330);
  await expect(page.locator('nav .active')).toHaveText('Calendario');

  await page.getByLabel(/^Papá, . 18 nov/).click();
  await page.waitForTimeout(400); // fin de la animación de apertura
  const grab = (await page.locator('.grab').boundingBox())!;
  const x = grab.x + grab.width / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: grab.y + 10 }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: grab.y + 10 + 22 * i }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.sheet')).toHaveCount(0);
});

test('saldos muestra primero a los adultos y los días disponibles se fijan en ajustes', async ({ page }) => {
  await tab(page, 'Ajustes').click();
  const f = page.getByLabel('Disponibles Vacaciones Papá', { exact: true });
  await f.fill('25');
  await f.blur();
  await tab(page, 'Calendario').click();
  await apply(page, 'Papá', 23, 'Vacaciones', '2026-11-24');
  await tab(page, 'Saldos').click();
  const heads = await page.locator('.stats > section h2').allInnerTexts();
  expect(heads[0]).toContain('Mamá');
  expect(heads[1]).toContain('Papá');
  await expect(page.locator('.card', { hasText: 'Papá' }).locator('.meter', { hasText: 'Vacaciones' })).toContainText('23 sin usar de 25');
});

test('ninguna tarjeta de ajustes se sale del ancho del móvil', async ({ page }) => {
  await tab(page, 'Ajustes').click();
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.card')].map((c) => c.scrollWidth - c.clientWidth));
  expect(overflow.every((o) => o <= 0)).toBe(true);
});

test('tema oscuro desde ajustes', async ({ page }) => {
  await tab(page, 'Ajustes').click();
  await page.getByRole('button', { name: 'Oscuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('si hay una versión nueva publicada, la app se recarga sola una vez', async ({ page }) => {
  await page.route('**/version.json*', (r) => r.fulfill({ json: { build: 'version-nueva' } }));
  await page.reload();
  await expect(page).toHaveURL(/\?v=version-nueva/);
  // Si tras recargar sigue saliendo la versión vieja (caché), avisa en vez de recargar en bucle
  await expect(page.getByText('Hay una versión nueva de la app.')).toBeVisible();
});

test('barra de pestañas: arrastrar el dedo por la barra elige la pestaña al soltar', async ({ page }) => {
  const bar = (await page.locator('nav.glassbar').boundingBox())!;
  const y = bar.y + bar.height / 2;
  const x = (i: number) => bar.x + 6 + ((bar.width - 12) / 4) * (i + 0.5);
  await page.mouse.move(x(0), y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x(0) + ((x(2) - x(0)) * i) / 12, y);
  await expect(page.locator('nav.glassbar button.hover')).toHaveText('Saldos');
  expect(await page.locator('nav.glassbar button').count()).toBe(4);
  await page.mouse.up();
  await expect(page.locator('nav .active')).toHaveText('Saldos');
});
