import { z } from 'zod';

import { db } from '../db.js';
import { ApiError } from './errors.js';

export const idParam = z.object({
  id: z.coerce.number().int().positive(),
});

export const foreignKey = z.coerce.number().int().positive();

export async function assertExists(table, id, label) {
  const row = await db(table).where({ id }).first();
  if (!row) {
    throw ApiError.notFound(`${label} with id ${id} not found`);
  }
  return row;
}

// Postgres raises 23505 when a unique constraint is violated. Catching it keeps
// concurrent inserts from surfacing as a 500 after the pre-check has passed.
export function isUniqueViolation(err) {
  return err?.code === '23505';
}
