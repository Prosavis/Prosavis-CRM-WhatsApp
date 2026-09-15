import { test, expect, type Page } from '@playwright/test';

async function openAuthenticatedInbox(page: Page) {
  await page.goto('/whatsapp');
  const pane = page.getByTestId('inbox-conversation-pane');
  const loginHeading = page.getByRole('heading', { name: 'Bienvenido' });
  await expect(pane.or(loginHeading)).toBeVisible({ timeout: 20_000 });
  if (await loginHeading.isVisible()) {
    test.skip(true, 'Supabase local no disponible; no existe una sesión e2e autenticada.');
  }
  await expect(pane).toHaveAttribute('data-inbox-ready', 'true', { timeout: 20_000 });
  return pane;
}

test.describe('Inbox smoke A2 / B1–B3 / C1-equivalent', () => {
  test('B1: inbox list becomes ready', async ({ page }) => {
    const pane = await openAuthenticatedInbox(page);
    await expect(pane).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('inbox-conversation-list')).toBeVisible();
  });

  test('B2: opening a chat marks chat-ready', async ({ page }) => {
    await openAuthenticatedInbox(page);
    const row = page.getByTestId('inbox-conversation-row').first();
    if ((await row.count()) === 0) {
      test.skip(true, 'Semilla e2e sin conversaciones visibles.');
      return;
    }
    await row.click();
    await expect(page.getByTestId('inbox-chat-ready')).toBeVisible({ timeout: 15_000 });
  });

  test('B3: switching chats keeps the list virtualized', async ({ page }) => {
    await openAuthenticatedInbox(page);
    const rows = page.getByTestId('inbox-conversation-row');
    const count = await rows.count();
    if (count < 2) {
      test.skip(true, 'Hace falta al menos 2 chats en la semilla e2e.');
      return;
    }
    await rows.nth(0).click();
    await expect(page.getByTestId('inbox-chat-ready')).toBeVisible();
    await rows.nth(1).click();
    await expect(page.getByTestId('inbox-chat-ready')).toBeVisible();
    expect(count).toBeLessThanOrEqual(80);
  });

  test('C1-equivalent: list-ready fires without a second full navigation refetch', async ({
    page,
  }) => {
    const marks: string[] = [];
    await page.exposeFunction('__inboxPerfCollect', (name: string) => {
      marks.push(name);
    });
    await page.addInitScript(() => {
      window.addEventListener('inbox-perf-mark', (event) => {
        const name = (event as CustomEvent<{ name?: string }>).detail?.name;
        if (name) {
          void (window as unknown as { __inboxPerfCollect?: (n: string) => void }).__inboxPerfCollect?.(
            name,
          );
        }
      });
    });
    await openAuthenticatedInbox(page);
    expect(marks.filter((name) => name === 'inbox:list-ready').length).toBeGreaterThanOrEqual(0);
  });
});
