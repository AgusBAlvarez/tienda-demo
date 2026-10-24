import { expect } from '@playwright/test';

export async function loginRapido(page) {
  await page.goto('http://127.0.0.1:5500/elbaul/public/admin/index.html');
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', 'admin@tienda-demo.com');
  await page.fill('#password', 'demo1234');
  await page.click('.btn-login');
  await page.waitForURL(/.*dashboard\.html/, { timeout: 15000 });
}