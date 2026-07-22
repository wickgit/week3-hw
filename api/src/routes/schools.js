import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db.js';
import { validateBody, validateQuery } from '../lib/validate.js';

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

router.post('/', validateBody(createBody), async (req, res) => {
  const [school] = await db('schools').insert(req.validated.body).returning('*');
  res.status(201).json({ data: school });
});

export default router;
