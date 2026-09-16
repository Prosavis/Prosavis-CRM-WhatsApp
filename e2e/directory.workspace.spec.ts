import { expect, test, type Page } from '@playwright/test';

async function openAuthenticatedDirectory(page: Page, search = 'tab=leads') {
  await page.goto(`/whatsapp?${search}`);
  const workspace = page.getByTestId('directory-workspace');
  const loginHeading = page.getByRole('heading', { name: 'Bienvenido' });
  await expect(workspace.or(loginHeading)).toBeVisible({ timeout: 20_000 });
  if (await loginHeading.isVisible()) {
    test.skip(true, 'No hay sesión e2e autenticada para el directorio.');
  }
  await expect(workspace).toBeVisible();
}

test.describe('Directorio integrado CRM', () => {
  test('shows the five KPIs and the three native views', async ({ page }) => {
    await openAuthenticatedDirectory(page);
    await expect(page.getByTestId('directory-kpi-total')).toBeVisible();
    await expect(page.getByTestId('directory-kpi-scheduled')).toBeVisible();
    await expect(page.getByTestId('directory-kpi-canceledOrRejected')).toBeVisible();
    await expect(page.getByTestId('directory-kpi-recurring')).toBeVisible();
    await expect(page.getByTestId('directory-kpi-reactivation')).toBeVisible();
    await page.getByTestId('directory-tab-all').click();
    await expect(page).toHaveURL(/dirView=directorio/);
    await page.getByTestId('directory-tab-canceled').click();
    await expect(page).toHaveURL(/dirView=cancelados/);
  });

  test('redirects the retired metrics directory URL', async ({ page }) => {
    await openAuthenticatedDirectory(page, 'tab=metrics&vista=clientes');
    await expect(page).toHaveURL(/tab=leads/);
    await expect(page).not.toHaveURL(/vista=clientes/);
    await expect(page.getByTestId('directory-workspace')).toBeVisible();
  });
});
