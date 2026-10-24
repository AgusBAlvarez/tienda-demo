import { request } from '@playwright/test';

const FS = 'http://127.0.0.1:8080/v1/projects/tienda-demo-5c115/databases/(default)/documents';

export default async function globalSetup() {
  const ctx = await request.newContext();

  // 1. Limpiar datos previos
  await ctx.delete('http://127.0.0.1:8080/emulator/v1/projects/tienda-demo-5c115/databases/(default)/documents');
  await ctx.delete('http://127.0.0.1:9099/emulator/v1/projects/tienda-demo-5c115/accounts');

  // 2. Crear usuario admin (sin localId)
  await ctx.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key',
    {
      data: {
        email: 'admin@tienda-demo.com',
        password: 'demo1234',
        returnSecureToken: true
      }
    }
  );

  // 3. Sembrar categorías
  await ctx.post(`${FS}/categorias?documentId=cat-otros`, {
    data: { fields: { nombre: { stringValue: 'Otros' }, esFija: { booleanValue: true } } }
  });

  await ctx.post(`${FS}/categorias`, {
    data: { fields: { nombre: { stringValue: 'Electrónica' } } }
  });

  await ctx.dispose();
}