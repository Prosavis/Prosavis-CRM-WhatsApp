import { test as setup, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const email = process.env.E2E_EMAIL ?? 'e2e@prosavis.local';
const password = process.env.E2E_PASSWORD ?? 'e2e-local-only';
const authFile = 'e2e/.auth/admin.json';

/** JWT service_role de Supabase local (demo). Solo se usa en e2e local. */
const LOCAL_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjg5Nn0.99sbWMSTR7BhVeZYktncWyWlNo67kHjr1PQmwGeisT0';

function writePlaceholderAuth() {
  mkdirSync(dirname(authFile), { recursive: true });
  writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
}

async function ensureLocalE2eAdmin(supabaseUrl: string): Promise<void> {
  const headers = {
    apikey: LOCAL_SERVICE_ROLE,
    Authorization: `Bearer ${LOCAL_SERVICE_ROLE}`,
    'Content-Type': 'application/json',
  };
  const createRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'E2E Admin' },
    }),
  });

  let userId: string | undefined;
  if (createRes.ok) {
    const body = (await createRes.json()) as { id?: string };
    userId = body.id;
  } else {
    const listRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users?page=1&per_page=200`, {
      headers,
    });
    if (listRes.ok) {
      const body = (await listRes.json()) as { users?: Array<{ id: string; email?: string }> };
      userId = body.users?.find((user) => user.email === email)?.id;
    }
  }

  if (!userId) return;

  await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/admin_profiles`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: userId,
      email,
      display_name: 'E2E Admin',
      role: 'super_admin',
      is_active: true,
    }),
  });
}

setup('authenticate e2e admin (local email/password only)', async ({ page }) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  try {
    const health = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`);
    if (!health.ok) {
      writePlaceholderAuth();
      setup.skip(true, `Supabase local no disponible (${supabaseUrl}).`);
      return;
    }
  } catch {
    writePlaceholderAuth();
    setup.skip(true, `Supabase local no disponible (${supabaseUrl}).`);
    return;
  }

  await ensureLocalE2eAdmin(supabaseUrl);
  await page.goto('/login');
  await page.getByLabel('Correo e2e').fill(email);
  await page.getByLabel('Contraseña e2e').fill(password);
  await page.getByTestId('e2e-email-login').click();
  await expect(page).toHaveURL(/whatsapp/, { timeout: 20_000 });
  mkdirSync(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
