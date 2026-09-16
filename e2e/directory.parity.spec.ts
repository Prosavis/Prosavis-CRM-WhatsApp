import { expect, test } from '@playwright/test';

const KPI_KEYS = [
  'total',
  'scheduled',
  'canceledOrRejected',
  'recurring',
  'reactivation',
] as const;

async function readDirectoryKpis(page: import('@playwright/test').Page) {
  const values: Record<string, string> = {};
  for (const key of KPI_KEYS) {
    values[key] = (await page.getByTestId(`directory-kpi-${key}`).innerText()).replace(/\D/g, '');
  }
  return values;
}

test('CRM and User Console share the same five directory KPIs when both sessions exist', async ({
  page,
  browser,
}) => {
  await page.goto('/whatsapp?tab=leads');
  const workspace = page.getByTestId('directory-workspace');
  const loginHeading = page.getByRole('heading', { name: 'Bienvenido' });
  await expect(workspace.or(loginHeading)).toBeVisible({ timeout: 20_000 });
  if (await loginHeading.isVisible()) {
    test.skip(true, 'No hay sesión e2e autenticada en CRM.');
  }

  const crmKpis = await readDirectoryKpis(page);
  for (const key of KPI_KEYS) {
    expect(crmKpis[key], key).toMatch(/^\d+$/);
  }

  const ucUrl = process.env.PLAYWRIGHT_UC_URL;
  if (!ucUrl) {
    test.skip(true, 'Define PLAYWRIGHT_UC_URL para comparar KPI contra User Console.');
  }

  const ucPage = await browser.newPage();
  await ucPage.goto(`${ucUrl.replace(/\/$/, '')}/crm/clients`);
  const ucWorkspace = ucPage.getByTestId('directory-workspace');
  await expect(ucWorkspace).toBeVisible({ timeout: 20_000 });
  const ucKpis = await readDirectoryKpis(ucPage);
  expect(ucKpis).toEqual(crmKpis);
});
