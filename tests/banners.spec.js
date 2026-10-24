import { test, expect } from '@playwright/test';
import { loginRapido } from './helpers.js';

const FS = 'http://127.0.0.1:8080/v1/projects/tienda-demo-5c115/databases/(default)/documents';
const ADMIN = 'http://127.0.0.1:5500/elbaul/public/admin';
const CLIENTE = 'http://127.0.0.1:5500/elbaul/public/catalogo/index.html';

test.describe('🎨 Banners', () => {
  test.beforeEach(async ({ request }) => {
    // Limpiar banners
    const res = await request.get(`${FS}/banners`);
    if (res.ok()) {
      const body = await res.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/banners/${doc.name.split('/').pop()}`);
      }
    }
  });

  test('admin puede crear un banner con imagen', async ({ page, request }) => {
    // Sembrar banner directo (el widget de Cloudinary no se puede automatizar fácil)
    await request.post(`${FS}/banners`, {
      data: {
        fields: {
          titulo: { stringValue: 'Oferta Test' },
          categoria: { stringValue: '' },
          fotoUrl: { stringValue: 'https://example.com/banner.jpg' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      },
    });

    await loginRapido(page);
    await page.goto(`${ADMIN}/pages/banners.html`);

    // Verificar que aparece en la tabla
    await expect(page.locator('#tablaBanners')).toContainText('Oferta Test', { timeout: 10000 });
    await expect(page.locator('#tablaBanners img')).toHaveAttribute('src', 'https://example.com/banner.jpg');
  });

  test('admin puede borrar un banner', async ({ page, request }) => {
    await request.post(`${FS}/banners`, {
      data: {
        fields: {
          titulo: { stringValue: 'Banner a Borrar' },
          categoria: { stringValue: '' },
          fotoUrl: { stringValue: 'https://example.com/banner.jpg' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      },
    });

    await loginRapido(page);
    await page.goto(`${ADMIN}/pages/banners.html`);

    // Aceptar el confirm automáticamente
    page.once('dialog', (d) => d.accept());

    // Click en borrar
    await page.locator('#tablaBanners tr', { hasText: 'Banner a Borrar' })
      .locator('.btn-eliminar')
      .click();

    // Verificar que desapareció
    await expect(page.locator('#tablaBanners')).not.toContainText('Banner a Borrar', { timeout: 10000 });
  });

  test('el catálogo muestra el banner en el carrusel', async ({ page, request }) => {
    // Sembrar producto activo
    await request.post(`${FS}/productos`, {
      data: {
        fields: {
          nombre: { stringValue: 'Prod Banner' },
          precio: { integerValue: '500' },
          stock: { integerValue: '5' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
        },
      },
    });

    // Sembrar banner
    await request.post(`${FS}/banners`, {
      data: {
        fields: {
          titulo: { stringValue: 'Banner Visible' },
          categoria: { stringValue: '' },
          fotoUrl: { stringValue: 'https://example.com/banner.jpg' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      },
    });

    await page.goto(CLIENTE);

    // Verificar que el carrusel tiene el banner
    await expect(page.locator('#carruselBanners img')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#carruselBanners img')).toHaveAttribute('src', 'https://example.com/banner.jpg');
  });

  test('click en banner con categoría filtra productos', async ({ page, request }) => {
    // Sembrar productos en 2 categorías
    await request.post(`${FS}/productos`, {
      data: {
        fields: {
          nombre: { stringValue: 'Prod Electrónica' },
          precio: { integerValue: '500' },
          stock: { integerValue: '5' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Electrónica' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
        },
      },
    });

    await request.post(`${FS}/productos`, {
      data: {
        fields: {
          nombre: { stringValue: 'Prod Otros' },
          precio: { integerValue: '300' },
          stock: { integerValue: '5' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
        },
      },
    });

    // Sembrar banner que filtra por Electrónica
    await request.post(`${FS}/banners`, {
      data: {
        fields: {
          titulo: { stringValue: 'Banner Electrónica' },
          categoria: { stringValue: 'Electrónica' },
          fotoUrl: { stringValue: 'https://example.com/banner.jpg' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      },
    });

    await page.goto(CLIENTE);
    await expect(page.locator('#carruselBanners img')).toBeVisible({ timeout: 10000 });

    // Click en el banner
    await page.locator('#carruselBanners img').click();

    // Verificar que solo se ve Prod Electrónica
    await expect(page.locator('#productos')).toContainText('Prod Electrónica', { timeout: 5000 });
    await expect(page.locator('#productos')).not.toContainText('Prod Otros');
  });
});