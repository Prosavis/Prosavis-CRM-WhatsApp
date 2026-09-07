import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const VISTAS = ['mapa', 'calidad', 'friccion', 'clientes', 'actividad', 'outbound'] as const;
const THEMES = ['light', 'dark'] as const;
const RESPONSIVE_WIDTHS = [320, 375, 768, 1024] as const;

test.use({ storageState: { cookies: [], origins: [] } });

for (const theme of THEMES) {
  for (const vista of VISTAS) {
    test(`${vista} keeps the premium control-room baseline in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/e2e/metrics-harness.html?vista=${vista}&theme=${theme}`);
      await expect(page.getByRole('heading', { name: 'Métricas operativas' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`metrics-${vista}-${theme}-1440.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: vista === 'mapa' ? 0.025 : 0.008,
      });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = results.violations.filter((violation) =>
        violation.impact === 'critical' || violation.impact === 'serious'
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
}

for (const width of RESPONSIVE_WIDTHS) {
  test(`map workbench reflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/metrics-harness.html?vista=mapa&theme=light');
    await expect(page.getByRole('region', { name: /Mapa de 34 citas/ })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Lectura y detalle del mapa' })).toBeVisible();
    await expect(page).toHaveScreenshot(`metrics-mapa-light-${width}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.025,
    });
  });
}

for (const theme of THEMES) {
  for (const width of RESPONSIVE_WIDTHS) {
    test(`all metrics views stay inside the viewport at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const vista of VISTAS) {
        await page.goto(`/e2e/metrics-harness.html?vista=${vista}&theme=${theme}`);
        await expect(page.getByRole('heading', { name: 'Métricas operativas' })).toBeVisible();
        const fitsViewport = await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        );
        expect(fitsViewport, `${vista} overflows at ${width}px in ${theme}`).toBe(true);
      }
    });
  }
}

test('keyboard navigation persists the selected view and period in the URL', async ({ page }) => {
  await page.goto('/e2e/metrics-harness.html?vista=calidad&theme=light');
  const qualityTab = page.getByRole('tab', { name: 'Calidad' });
  await qualityTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Fricción' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/vista=friccion/);

  await page.getByRole('combobox', { name: 'Periodo' }).click();
  await page.getByRole('option', { name: '90 días' }).click();
  await expect(page).toHaveURL(/days=90/);
});
