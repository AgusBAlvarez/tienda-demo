import { request } from '@playwright/test';

export default async function globalSetup() {
  const context = await request.newContext();

  // 1. Crear el usuario admin en el emulador de Auth
  await context.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key', {
    data: { email: 'admin@tienda-demo.com', password: 'demo1234', returnSecureToken: true },
  });

  // 2. Inyectar un producto directo en Firestore
  await context.post('http://127.0.0.1:8080/v1/projects/tienda-demo-5c115/databases/(default)/documents/productos', {
    data: {
      fields: {
        nombre: { stringValue: 'Producto de Prueba Playwright' },
        precio: { integerValue: '1500' },
        stock: { integerValue: '10' },
        estado: { stringValue: 'activo' },
        categoria: { stringValue: 'Otros' }
      }
    }
  });

  await context.dispose();
}