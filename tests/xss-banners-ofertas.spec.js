import { test, expect } from '@playwright/test';
import { loginRapido, asegurarUsuarioAdmin } from './helpers.js';

const FS = 'http://127.0.0.1:8080/v1/projects/tienda-demo-5c115/databases/(default)/documents';
const ADMIN = 'http://127.0.0.1:5500/elbaul/public/admin';
const CLIENTE = 'http://127.0.0.1:5500/elbaul/public/catalogo/index.html';

const OWNER = { Authorization: 'Bearer owner' };

const PAYLOADS = [
  '<img src=x onerror="window.__xss=1">',
  '" onerror="window.__xss=1" x="',
];

test.describe('🛡️ Seguridad: XSS en Banners y Ofertas', () => {

    test.beforeAll(async ({ request }) => {
        await asegurarUsuarioAdmin(request);
    });

  test('Banners: el admin no ejecuta XSS en el título', async ({ page, request }) => {
    const bannerId = 'xss-banner-admin';
    const res = await request.post(`${FS}/banners?documentId=${bannerId}`, {
      headers: OWNER,
      data: {
        fields: {
          titulo: { stringValue: PAYLOADS[0] },
          categoria: { stringValue: '' },
          fotoUrl: { stringValue: 'https://example.com/banner.jpg' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      },
    });
    expect(res.ok()).toBeTruthy();

    await loginRapido(page);
    await page.goto(`${ADMIN}/pages/banners.html`);

    await expect(page.locator('#tablaBanners')).not.toContainText('Cargando...', { timeout: 10000 });
    await expect(page.locator('#tablaBanners')).toContainText('<img src=x');
    await expect(page.locator('#tablaBanners img[src="x"]')).toHaveCount(0);

    await request.delete(`${FS}/banners/${bannerId}`, { headers: OWNER });
  });

  test('Banners: el catálogo no ejecuta XSS en el título', async ({ page, request }) => {
    const bannerId = 'xss-banner-cat';
    const res = await request.post(`${FS}/banners?documentId=${bannerId}`, {
      headers: OWNER,
      data: {
        fields: {
          titulo: { stringValue: PAYLOADS[0] },
          categoria: { stringValue: '' },
          fotoUrl: { stringValue: 'https://example.com/banner.jpg' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto(CLIENTE);
    await page.waitForSelector('#carruselBanners img', { timeout: 10000 });
    await expect(page.locator('#carruselBanners img[src="x"]')).toHaveCount(0);

    await request.delete(`${FS}/banners/${bannerId}`, { headers: OWNER });
  });

  test('Ofertas: el admin no ejecuta XSS en el nombre del producto', async ({ page, request }) => {
    const prodId = 'xss-prod-admin';
    const res = await request.post(`${FS}/productos?documentId=${prodId}`, {
      headers: OWNER,
      data: {
        fields: {
          nombre: { stringValue: PAYLOADS[0] },
          precio: { integerValue: '1000' },
          precioOferta: { integerValue: '800' },
          stock: { integerValue: '10' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
        },
      },
    });
    expect(res.ok()).toBeTruthy();

    await loginRapido(page);
    await page.goto(`${ADMIN}/pages/productos.html`);

    await expect(page.locator('#tablaBody')).not.toContainText('Cargando...', { timeout: 10000 });
    await expect(page.locator('#tablaBody')).toContainText('<img src=x');
    await expect(page.locator('#tablaBody img[src="x"]')).toHaveCount(0);

    await request.delete(`${FS}/productos/${prodId}`, { headers: OWNER });
  });

  test('Ofertas: el catálogo no ejecuta XSS en el nombre del producto', async ({ page, request }) => {
    const prodId = 'xss-prod-cat';
    const res = await request.post(`${FS}/productos?documentId=${prodId}`, {
      headers: OWNER,
      data: {
        fields: {
          nombre: { stringValue: PAYLOADS[0] },
          precio: { integerValue: '1000' },
          precioOferta: { integerValue: '800' },
          stock: { integerValue: '10' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
        },
      },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto(CLIENTE);
    await page.waitForSelector('.producto', { timeout: 10000 });
    await expect(page.locator('.producto img[src="x"]')).toHaveCount(0);

    await request.delete(`${FS}/productos/${prodId}`, { headers: OWNER });
  });
});