import { request } from '@playwright/test';

const FS = 'http://127.0.0.1:8080/v1/projects/tienda-demo-5c115/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };

export default async function globalSetup() {
  const ctx = await request.newContext();

  // 1. Limpiar datos previos (endpoints del emulador, sin auth)
  await ctx.delete('http://127.0.0.1:8080/emulator/v1/projects/tienda-demo-5c115/databases/(default)/documents');
  await ctx.delete('http://127.0.0.1:9099/emulator/v1/projects/tienda-demo-5c115/accounts');

  // 2. Crear usuario admin en Auth Emulator
  await ctx.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key',
    {
      data: {
        email: 'admin@tienda-demo.com',
        password: 'demo1234',
        returnSecureToken: true,
      },
    }
  );

  // 3. Sembrar categorías
  const cat1 = await ctx.post(`${FS}/categorias?documentId=cat-otros`, {
    headers: OWNER,
    data: { fields: { nombre: { stringValue: 'Otros' }, esFija: { booleanValue: true } } },
  });
  if (!cat1.ok()) throw new Error(`No se pudo crear 'Otros': ${cat1.status()} ${await cat1.text()}`);

  const cat2 = await ctx.post(`${FS}/categorias`, {
    headers: OWNER,
    data: { fields: { nombre: { stringValue: 'Electrónica' } } },
  });
  if (!cat2.ok()) throw new Error(`No se pudo crear 'Electrónica': ${cat2.status()} ${await cat2.text()}`);

  // 4. Sembrar pedido malicioso para el test de XSS
  const pedido = await ctx.post(`${FS}/pedidos?documentId=XSS99`, {
    headers: OWNER,
    data: {
      fields: {
        codigo: { stringValue: 'XSS99' },
        estado: { stringValue: 'pendiente' },
        total: { integerValue: '100' },
        fecha: { timestampValue: new Date().toISOString() },
        items: {
          arrayValue: {
            values: [{
              mapValue: {
                fields: {
                  productoId: { stringValue: 'prod-xss' },
                  nombre: { stringValue: '<img src=x onerror="window.__xss=1">' },
                  cantidad: { integerValue: '1' },
                  precioCongelado: { integerValue: '100' },
                },
              },
            }],
          },
        },
      },
    },
  });
  if (!pedido.ok()) throw new Error(`No se pudo crear pedido XSS: ${pedido.status()} ${await pedido.text()}`);

  // 5. Crear el producto que usa el pedido XSS
  const prod = await ctx.post(`${FS}/productos?documentId=prod-xss`, {
    headers: OWNER,
    data: {
      fields: {
        nombre: { stringValue: 'Producto XSS' },
        precio: { integerValue: '100' },
        stock: { integerValue: '10' },
        stockMinimo: { integerValue: '1' },
        estado: { stringValue: 'activo' },
        categoria: { stringValue: 'Otros' },
        fotoUrl: { stringValue: 'x' },
        descripcion: { stringValue: '' },
      },
    },
  });
  if (!prod.ok()) throw new Error(`No se pudo crear prod-xss: ${prod.status()} ${await prod.text()}`);

  await ctx.dispose();
}