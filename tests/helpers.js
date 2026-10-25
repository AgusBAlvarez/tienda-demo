// tests/helpers.js
import { expect } from '@playwright/test';

export async function asegurarUsuarioAdmin(request) {
  const AUTH_EMU =
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key';

  const res = await request.post(AUTH_EMU, {
    data: {
      email: 'admin@tienda-demo.com',
      password: 'demo1234',
      returnSecureToken: true,
    },
  });

  if (res.status() !== 200 && res.status() !== 400) {
    throw new Error(`No se pudo crear el usuario admin: ${res.status()}`);
  }
}

export async function loginRapido(page) {
  await page.goto('http://127.0.0.1:5500/elbaul/public/admin/index.html');
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', 'admin@tienda-demo.com');
  await page.fill('#password', 'demo1234');
  await page.click('.btn-login');
  await page.waitForURL(/.*dashboard\.html/, { timeout: 15000 });
}