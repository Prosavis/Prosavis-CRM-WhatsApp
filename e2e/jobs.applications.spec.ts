import { expect, test, type Page } from '@playwright/test';

async function openJobs(page: Page) {
  await page.goto('/whatsapp?tab=jobs');
  const workspace = page.getByTestId('jobs-workspace');
  const loginHeading = page.getByRole('heading', { name: 'Bienvenido' });
  await expect(workspace.or(loginHeading)).toBeVisible({ timeout: 20_000 });
  if (await loginHeading.isVisible()) {
    test.skip(true, 'No hay sesión e2e autenticada para solicitudes.');
  }
  await expect(workspace).toBeVisible();
}

test.describe('Solicitudes de empleo', () => {
  test('shows the module after Directorio and the three workspace tabs', async ({ page }) => {
    await openJobs(page);
    await expect(page.getByRole('button', { name: 'Solicitudes de empleo' })).toBeVisible();
    await expect(page.getByTestId('jobs-tab-list')).toBeVisible();
    await expect(page.getByTestId('jobs-tab-analytics')).toBeVisible();
    await expect(page.getByTestId('jobs-tab-review')).toBeVisible();
    await page.getByTestId('jobs-tab-analytics').click();
    await expect(page.getByTestId('jobs-analytics')).toBeVisible();
  });
});
