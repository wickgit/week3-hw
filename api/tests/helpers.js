import request from 'supertest';

import { createApp } from '../src/app.js';
import { db } from '../src/db.js';

// resetDatabase() truncates everything, so refuse to run against anything but
// the test database. NODE_ENV is set by the `npm test` script.
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Tests must run with NODE_ENV=test — use `npm test`');
}

export const app = createApp();
export { db, request };

export const ADMIN = { email: 'admin@school.example', password: 'admin123' };

// Every suite starts from the same rows, so tests can assert on seeded ids.
export async function resetDatabase() {
  await db.migrate.latest();
  await db.seed.run();
}

export async function login(credentials = ADMIN) {
  const res = await request(app).post('/auth/login').send(credentials);
  return res.body.token;
}

export function authed(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}
