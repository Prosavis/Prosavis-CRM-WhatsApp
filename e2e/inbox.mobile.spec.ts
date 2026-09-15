import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function openAuthenticatedInbox(page: Page) {
  await page.goto('/whatsapp');
  const listPane = page.getByTestId('inbox-conversation-pane');
  const loginHeading = page.getByRole('heading', { name: 'Bienvenido' });
  await expect(listPane.or(loginHeading)).toBeVisible({ timeout: 20_000 });
  if (await loginHeading.isVisible()) {
    test.skip(true, 'Supabase local no disponible; no existe una sesión e2e autenticada.');
  }
  await expect(listPane).toHaveAttribute('data-inbox-ready', 'true', { timeout: 20_000 });
  return listPane;
}

test.describe('Mobile WhatsApp inbox', () => {
  test('switches from the conversation list to a full-width chat and back', async ({ page }) => {
    const listPane = await openAuthenticatedInbox(page);
    await expect(listPane).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const row = page.getByTestId('inbox-conversation-row').first();
    if ((await row.count()) === 0) {
      test.skip(true, 'Semilla e2e sin conversaciones visibles.');
      return;
    }

    await row.click();
    await expect(page.getByTestId('inbox-chat-ready')).toBeVisible({ timeout: 15_000 });
    await expect(listPane).toBeHidden();
    await expect(page.getByRole('button', { name: 'Volver a la bandeja' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Más acciones del chat' }).click();
    await expect(page.getByRole('menuitem', { name: 'Ficha del cliente' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Volver a la bandeja' }).click();
    await expect(listPane).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('opens mobile category filters without shrinking the conversation list', async ({ page }) => {
    await openAuthenticatedInbox(page);
    await page.getByRole('button', { name: /Filtrar conversaciones/ }).click();
    await expect(page.getByRole('button', { name: 'Cerrar filtros' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Todos:/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
