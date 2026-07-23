import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db.js';
import { ApiError } from '../lib/errors.js';
import { assertExists, idParam, isUniqueViolation } from '../lib/resources.js';
import { validateBody, validateParams, validateQuery } from '../lib/validate.js';

const router = Router();

const listQuery = z.object({
  q: z.string().trim().min(1).optional(),
});

const createBody = z.object({
  name: z.string().trim().min(1),
  city: z.string().trim().min(1).optional(),
});

router.get('/', validateQuery(listQuery), async (req, res) => {
  const { q } = req.validated.query;

  const query = db('schools').select('*').orderBy('id');
  if (q) {
    query.where((builder) =>
      builder.whereILike('name', `%${q}%`).orWhereILike('city', `%${q}%`),
    );
  }

  res.json({ data: await query });
});

router.get('/:id', validateParams(idParam), async (req, res) => {
  const school = await assertExists('schools', req.validated.params.id, 'School');
  res.json({ data: school });
});

router.post('/', validateBody(createBody), async (req, res, next) => {
  const body = req.validated.body;

  try {
    const [school] = await db('schools').insert(body).returning('*');
    res.status(201).json({ data: school });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return next(
        ApiError.conflict(`School "${body.name}" already exists in ${body.city ?? 'this city'}`),
      );
    }
    throw err;
  }
});

export default router;
